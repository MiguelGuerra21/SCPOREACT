// src/workers/exportWorker.js
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
/* eslint-disable no-console */
/* global JSZip, shpwrite */

importScripts('/libs/shpwrite.js','/libs/jszip.js');

/* ---------- Helper debug para enviar mensajes al hilo principal ---------- */
function workerDebug(msg, data) {
  try {
    postMessage({ type: 'debug', message: msg, data });
  } catch (_) {
    // no hacemos nada si falla el debug
  }
}

/* ---------- DBFGenerator (adaptado) ---------- */
class DBFGenerator {
  constructor(features, options = {}) {
    this.features = features || [];
    this.options = { preserveFid: true, fidFieldName: 'fid', strictMode: false, ...options };
    this.schema = this.analyzeSchema();
    // Forzar el campo fid como primer campo si existe
    const fidIndex = this.schema.findIndex(f => f.originalName.toLowerCase() === 'fid');
    if (fidIndex > 0) {
      // Mover fid al inicio si no es el primer campo
      const [fidField] = this.schema.splice(fidIndex, 1);
      this.schema.unshift(fidField);
    } else if (fidIndex === -1 && this.options.preserveFid) {
      // Agregar fid si no existe pero debe preservarse
      this.schema.unshift({
        name: 'fid',
        originalName: 'fid',
        type: 'N',
        size: 10,
        decimals: 0
      });
    }
  }

  analyzeSchema() {
    if (!this.features || this.features.length === 0) return [];

    const sampleProps = this.features[0]?.properties || {};
    const fields = [];

    Object.keys(sampleProps).forEach(key => {
      const values = this.features.map(f => f.properties?.[key]).filter(v => v !== undefined);
      const field = {
        name: this.normalizeFieldName(key),
        originalName: key,
        type: this.detectFieldType(values),
        size: this.calculateFieldSize(key, values)
      };

      if (field.type === 'N') {
        field.decimals = this.calculateDecimals(values);
      }

      field.size = Math.max(1, field.size);
      fields.push(field);
    });

    return fields;
  }

  calculateDecimals(values) {
    let maxDecimals = 0;
    values.forEach(value => {
      if (value != null && typeof value === 'number') {
        const str = value.toString();
        const decimalIndex = str.indexOf('.');
        if (decimalIndex !== -1) {
          const decimals = str.length - decimalIndex - 1;
          maxDecimals = Math.max(maxDecimals, decimals);
        }
      }
    });
    return Math.min(15, maxDecimals);
  }

  normalizeFieldName(name) {
    return String(name)
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑüÜ_]/g, '_')
      .slice(0, 10);
  }

  detectFieldType(values) {
    const sample = values.find(v => v != null);
    if (typeof sample === 'number') return 'N';
    if (sample instanceof Date) return 'D';
    if (typeof sample === 'boolean') return 'L';
    if (typeof sample === 'string') {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample) ||
          /^\d{8}$/.test(sample) ||
          /^\d{4}-\d{2}-\d{2}$/.test(sample)) return 'D';
    }
    return 'C';
  }

  calculateFieldSize(key, values) {
    const sample = values.find(v => v != null);
    if (sample instanceof Date ||
        (/^\d{8}$/.test(String(sample))) ||
        (/^\d{2}\/\d{2}\/\d{4}$/.test(String(sample))) ||
        (/^\d{4}-\d{2}-\d{2}$/.test(String(sample)))) {
      return 8;
    }

    let maxSize = 1;
    values.forEach(value => {
      if (value != null) {
        const str = String(value);
        const byteLength = new TextEncoder().encode(str).length;
        maxSize = Math.max(maxSize, byteLength);
      }
    });
    return Math.min(254, Math.max(1, maxSize));
  }

  createDBFBuffer() {
    const header = this.createHeader();
    const records = this.createRecords();
    const buffer = new Uint8Array(header.length + records.length);
    buffer.set(header);
    buffer.set(records, header.length);
    return buffer;
  }

  createHeader() {
    const headerSize = 32 + (32 * this.schema.length) + 1;
    const header = new Uint8Array(headerSize);
    const view = new DataView(header.buffer);

    view.setUint8(0, 0x03);
    const now = new Date();
    view.setUint8(1, now.getFullYear() - 1900);
    view.setUint8(2, now.getMonth() + 1);
    view.setUint8(3, now.getDate());
    view.setUint32(4, this.features.length, true);

    view.setUint16(8, headerSize, true);

    const recordLength = 1 + this.schema.reduce((sum, field) => sum + field.size, 0);
    view.setUint16(10, recordLength, true);
    view.setUint8(29, 0x57); // LDID pointer to .cpg

    this.schema.forEach((field, index) => {
      const offset = 32 + (32 * index);
      this.writeFieldDescriptor(header, offset, field);
    });

    header[headerSize - 1] = 0x0D;
    return header;
  }

  writeFieldDescriptor(buffer, offset, field) {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(field.name.slice(0, 11));
    buffer.set(nameBytes, offset);
    if (nameBytes.length < 11) {
      buffer.set(new Uint8Array(11 - nameBytes.length).fill(0x00), offset + nameBytes.length);
    }

    buffer[offset + 11] = field.type.charCodeAt(0);
    buffer[offset + 16] = field.size & 0xFF;
    if (field.type === 'N') {
      buffer[offset + 17] = field.decimals || 0;
    }
  }

  createRecords() {
    const recordSize = 1 + this.schema.reduce((sum, field) => sum + field.size, 0);
    const records = new Uint8Array(this.features.length * recordSize);

    this.features.forEach((feature, featureIndex) => {
      const recordOffset = featureIndex * recordSize;
      records[recordOffset] = 0x20;

      this.schema.forEach((field, fieldIndex) => {
        const fieldOffset = recordOffset + 1 + this.schema.slice(0, fieldIndex).reduce((sum, f) => sum + f.size, 0);
        let value;
        
        // FID EXACTO del original (nunca lo recalcules)
        if (field.originalName.toLowerCase() === 'fid') {
          value = feature.properties?.fid || feature.id || feature.properties?.FID || feature.properties?.OBJECTID;
        } else {
          value = feature.properties?.[field.originalName];
        }
        
        records.set(this.encodeValue(value, field), fieldOffset);
      });
    });

    return records;
  }

  encodeValue(value, field) {
    const encoder = new TextEncoder();
    const size = field.size;

    if (value == null) {
      return new Uint8Array(size).fill(32);
    }

    switch (field.type) {
      case 'N': {
        const num = Number(value);
        if (isNaN(num)) return new Uint8Array(size).fill(32);
        const str = num.toFixed(field.decimals || 0);
        return this.rightPad(encoder.encode(str), size, 32);
      }
      case 'D': {
        let dateStr = '';
        if (value instanceof Date) {
          dateStr = this.formatDateYYYYMMDD(value);
        } else if (typeof value === 'string') {
          const s = value.trim();
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
            const [d, m, y] = s.split('/');
            dateStr = `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}`;
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            dateStr = s.replace(/-/g, '');
          } else if (/^\d{8}$/.test(s)) {
            dateStr = s;
          } else {
            dateStr = '';
          }
        }
        const out = new Uint8Array(8).fill(32);
        const enc = encoder.encode(dateStr.slice(0,8));
        out.set(enc, 0);
        return out;
      }
      default: {
        const encoded = encoder.encode(String(value));
        const result = new Uint8Array(size).fill(32);
        const length = Math.min(encoded.length, size);
        result.set(encoded.subarray(0, length), 0);
        return result;
      }
    }
  }

  rightPad(array, length, fillChar) {
    if (array.length >= length) return array.subarray(0, length);
    const result = new Uint8Array(length).fill(fillChar);
    result.set(array, 0);
    return result;
  }

  formatDateYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
}

/* ---------- Helpers para shp-write robusto y diagnóstico ---------- */

async function generateShpZipWithDiagnostics(featureCollection) {
  workerDebug('start-generateShpZip', { featureCount: featureCollection.features.length });

  try {
    workerDebug('shpwrite_type', { typeof_shpwrite: typeof shpwrite, keys: Object.keys(shpwrite || {}) });
  } catch (_) { /* ignore */ }

  const tryCallbackStyle = () => new Promise((resolve, reject) => {
    try {
      if (shpwrite && typeof shpwrite.zip === 'function') {
        try {
          shpwrite.zip(featureCollection, { base64: true }, (err, result) => {
            if (err) return reject(new Error(`shp-write callback error: ${err && err.message ? err.message : String(err)}`));
            return resolve(result);
          });
          return;
        } catch (inner) {
          return reject(inner);
        }
      }
      return reject(new Error('callback style not available'));
    } catch (err) {
      return reject(err);
    }
  });

  const tryZipProp = async () => {
    if (shpwrite && typeof shpwrite.zip === 'function') {
      const maybe = shpwrite.zip(featureCollection, { base64: true });
      if (maybe && typeof maybe.then === 'function') return await maybe;
      return maybe;
    }
    throw new Error('zip prop style not available');
  };

  const tryFunctionReturn = async () => {
    if (typeof shpwrite === 'function') {
      const maybe = shpwrite(featureCollection, { base64: true });
      if (maybe && typeof maybe.then === 'function') return await maybe;
      return maybe;
    }
    throw new Error('function-return style not available');
  };

  const tryDefaultProp = async () => {
    const candidate = shpwrite && shpwrite.default ? shpwrite.default : null;
    if (candidate) {
      if (typeof candidate.zip === 'function') {
        const r = candidate.zip(featureCollection, { base64: true });
        if (r && typeof r.then === 'function') return await r;
        return r;
      }
      if (typeof candidate === 'function') {
        const r = candidate(featureCollection, { base64: true });
        if (r && typeof r.then === 'function') return await r;
        return r;
      }
    }
    throw new Error('default prop style not available');
  };

  const attempts = [
    { name: 'callbackStyle', fn: tryCallbackStyle },
    { name: 'zipProp', fn: tryZipProp },
    { name: 'functionReturn', fn: tryFunctionReturn },
    { name: 'defaultProp', fn: tryDefaultProp }
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      workerDebug('attempt', { attempt: attempt.name });
      const result = await attempt.fn();
      if (!result || typeof result !== 'string' || !result.trim()) {
        throw new Error(`Attempt ${attempt.name} returned invalid result`);
      }
      workerDebug('shp-write-success', { attempt: attempt.name });
      return result;
    } catch (err) {
      workerDebug('shp-write-attempt-failed', { attempt: attempt.name, message: err?.message, stack: err?.stack });
      errors.push({ attempt: attempt.name, message: err?.message || String(err) });
    }
  }

  throw new Error(`All shp-write attempts failed. Attempts: ${JSON.stringify(errors)}`);
}

/* ---------- util: base64 -> ArrayBuffer ---------- */
function base64ToArrayBuffer(b64) {
  if (typeof b64 !== 'string') throw new TypeError('Base64 input must be a string');
  const clean = b64.replace(/\s/g, '');
  if (!clean) throw new Error('Empty base64 string');

  try {
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch (err) {
    // fallback Node Buffer (raramente disponible en worker del navegador)
    try {
      if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(clean, 'base64');
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }
    } catch (_) { /* ignore */ }
    throw new Error(`Base64 decoding failed: ${err.message}`);
  }
}

/* ---------- Entrypoint: manejar mensajes ---------- */
addEventListener('message', async (e) => {
  const { geojson, layerName, options } = e.data || {};
  const { 
    encoding = 'UTF-8', 
    preserveFids = false,
    fidFieldName = 'fid'
  } = options || {};

  try {
    if (!geojson || typeof geojson !== 'object') {
      throw new Error('Invalid GeoJSON: must be an object');
    }
    if (!Array.isArray(geojson.features)) {
      throw new Error('GeoJSON must contain a features array');
    }

    const validFeatures = geojson.features;

    // 1) Generar base64 ZIP con shp-write (diagnóstico robusto)
    let shpZipBase64;
    try {
      shpZipBase64 = await generateShpZipWithDiagnostics({ type: 'FeatureCollection', features: validFeatures });
    } catch (err) {
      workerDebug('generateShpZip_failed', { message: err.message });
      throw new Error('Failed to generate base shapefiles with shp-write — check debug messages for details');
    }

    // 2) Convertir base64 zip a ArrayBuffer y leer con JSZip
    const zipArrayBuffer = base64ToArrayBuffer(shpZipBase64);
    const tempZip = new JSZip();
    await tempZip.loadAsync(zipArrayBuffer).catch(err => { throw new Error(`Failed to parse shp-write ZIP: ${err.message}`); });

    const findFile = (zipObj, ext) => {
      const fname = Object.keys(zipObj.files).find(f => f.toLowerCase().endsWith(ext.toLowerCase()));
      if (!fname) throw new Error(`Required ${ext} file not found in generated ZIP`);
      return zipObj.file(fname);
    };

    const shpFile = findFile(tempZip, '.shp');
    const shxFile = findFile(tempZip, '.shx');

    const shpBuffer = await shpFile.async('arraybuffer').catch(err => { throw new Error(`Failed to read .shp: ${err.message}`); });
    const shxBuffer = await shxFile.async('arraybuffer').catch(err => { throw new Error(`Failed to read .shx: ${err.message}`); });

    // 3) Generar DBF con DBFGenerator
    let dbfBuffer;
    try {
      const dbfGenerator = new DBFGenerator(validFeatures, {
        preserveFid: preserveFids,
        fidFieldName: fidFieldName
      });
      dbfBuffer = dbfGenerator.createDBFBuffer();
    } catch (err) {
      throw new Error(`DBF generation failed: ${err.message}`);
    }

    // 4) Crear ZIP final con JSZip
    const zip = new JSZip();
    const baseName = (layerName || 'export').replace(/[^\w]/g, '_').toLowerCase().slice(0, 50);

    zip.file(`${baseName}.shp`, shpBuffer);
    zip.file(`${baseName}.shx`, shxBuffer);
    zip.file(`${baseName}.dbf`, dbfBuffer);
    zip.file(`${baseName}.cpg`, encoding);
    zip.file(`${baseName}.prj`,
      'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
    );

    const result = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      platform: 'DOS'
    });

    if (!result || result.byteLength === 0) {
      throw new Error('Generated ZIP is empty');
    }

    postMessage({
      type: 'done',
      zip: result,
      metadata: { layerName: baseName, featureCount: validFeatures.length, encoding }
    });
  } catch (err) {
    console.error('Worker error:', err);
    postMessage({
      type: 'error',
      message: err?.message || String(err),
      stack: err?.stack || null,
      details: {
        featuresReceived: e?.data?.geojson?.features?.length ?? null,
      }
    });
  }
});
