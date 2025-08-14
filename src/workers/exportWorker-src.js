/* eslint-disable no-restricted-globals */
/* global JSZip, shpwrite */
importScripts('/libs/shpwrite.js', '/libs/jszip.js');

class DBFGenerator {
  constructor(features) {
    this.features = features;
    this.schema = this.analyzeSchema();
  }

  analyzeSchema() {
    if (!this.features || this.features.length === 0) return [];
    
    const sampleProps = this.features[0]?.properties || {};
    const fields = [];

    Object.keys(sampleProps).forEach(key => {
      const values = this.features.map(f => f.properties?.[key]).filter(v => v !== undefined);
      const field = {
        name: this.normalizeFieldName(key), // Modificado para mantener original
        originalName: key,
        type: this.detectFieldType(values),
        size: this.calculateFieldSize(key, values)
      };

      if (field.type === 'N') {
        field.decimals = this.calculateDecimals(values);
      }

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
    // Mantener el nombre original pero con ajustes mínimos para compatibilidad DBF
    return String(name)
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑüÜ_]/g, '_') // Permitir acentos y ñ
      .slice(0, 10); // Longitud máxima pero sin convertir a mayúsculas
  }

detectFieldType(values) {
  const sample = values.find(v => v != null);
  if (typeof sample === 'number') return 'N';
  if (sample instanceof Date) return 'D';
  if (typeof sample === 'boolean') return 'L';
  if (typeof sample === 'string') {
    // aceptar dd/mm/yyyy o yyyymmdd o yyyy-mm-dd
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample) || /^\d{8}$/.test(sample) || /^\d{4}-\d{2}-\d{2}$/.test(sample)) return 'D';
  }
  return 'C';
}
  calculateFieldSize(key, values) {
    // Si detectamos tipo fecha (strings 'dd/mm/yyyy' o Date) devolvemos 8
    const sample = values.find(v => v != null);
    if (sample instanceof Date || (/^\d{4}\d{2}\d{2}$/.test(String(sample))) || (/^\d{2}\/\d{2}\/\d{4}$/.test(String(sample)))) {
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

    // Configuración de cabecera DBF
    view.setUint8(0, 0x03); // dBASE III con soporte UTF-8
    const now = new Date();
    view.setUint8(1, now.getFullYear() - 1900);
    view.setUint8(2, now.getMonth() + 1);
    view.setUint8(3, now.getDate());
    view.setUint32(4, this.features.length, true);
    view.setUint16(8, headerSize, true);
    
    const recordLength = this.schema.reduce((sum, field) => sum + field.size, 1);
    view.setUint16(10, recordLength, true);
    view.setUint8(29, 0x57); // LDID 0x57 indica que mire el archivo .cpg

    // Descriptores de campo con nombres originales
    this.schema.forEach((field, index) => {
      const offset = 32 + (32 * index);
      this.writeFieldDescriptor(header, offset, field);
    });

    header[headerSize - 1] = 0x0D;
    return header;
  }

  writeFieldDescriptor(buffer, offset, field) {
    const encoder = new TextEncoder();
    // Usar el nombre original (sin convertir a mayúsculas)
    const nameBytes = encoder.encode(field.name.slice(0, 11));
    buffer.set(nameBytes, offset);
    if (nameBytes.length < 11) {
      buffer.set(new Uint8Array(11 - nameBytes.length).fill(0x00), offset + nameBytes.length);
    }
    buffer[offset + 11] = field.type.charCodeAt(0);
    buffer[offset + 16] = field.size;
    if (field.type === 'N') {
      buffer[offset + 17] = field.decimals || 0;
    }
  }

  createRecords() {
    const recordSize = this.schema.reduce((sum, field) => sum + field.size, 1);
    const records = new Uint8Array(this.features.length * recordSize);

    this.features.forEach((feature, featureIndex) => {
      const recordOffset = featureIndex * recordSize;
      records[recordOffset] = 0x20; // Registro activo

      this.schema.forEach((field, fieldIndex) => {
        const fieldOffset = recordOffset + 1 + this.schema.slice(0, fieldIndex).reduce((sum, f) => sum + f.size, 0);
        const value = feature.properties?.[field.originalName];
        records.set(this.encodeValue(value, field), fieldOffset);
      });
    });

    return records;
  }

  encodeValue(value, field) {
    const encoder = new TextEncoder();
    const size = field.size;

    if (value == null) {
      return new Uint8Array(size).fill(32); // Espacios en blanco
    }

    switch (field.type) {
      case 'N':
        const num = Number(value);
        if (isNaN(num)) {
          return new Uint8Array(size).fill(32);
        }
        const str = num.toFixed(field.decimals || 0);
        return this.padStart(encoder.encode(str), size, 32); // Rellenar con espacios

      case 'D':
        let dateStr;
        if (value instanceof Date) {
          dateStr = this.formatDate(value);
        } else if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
          dateStr = value.replace(/-/g, '');
        } else {
          dateStr = '';
        }
        return encoder.encode(dateStr);

      default:
        // Para strings, codificar como UTF-8 y truncar si es necesario
        const encoded = encoder.encode(String(value));
        const result = new Uint8Array(size);
        const length = Math.min(encoded.length, size);
        result.set(encoded.subarray(0, length));
        if (length < size) {
          result.set(new Uint8Array(size - length).fill(32), length); // Rellenar con espacios
        }
        return result;
    }
  }

  padStart(array, length, fill) {
    if (array.length >= length) return array.subarray(0, length);
    const result = new Uint8Array(length).fill(fill);
    result.set(array, length - array.length);
    return result;
  }

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }
}

self.onmessage = async (e) => {
  const { geojson, layerName, options } = e.data;
  const { encoding = 'UTF-8' } = options || {};

  try {
    // 1. Validación de entrada
    if (!geojson || typeof geojson !== 'object') {
      throw new Error('Invalid GeoJSON: must be an object');
    }

    if (!geojson.features || !Array.isArray(geojson.features)) {
      throw new Error('GeoJSON must contain a features array');
    }

    // 2. Filtrar features válidas
    const validFeatures = geojson.features.filter(f => {
      try {
        return (
          f?.geometry?.coordinates &&
          Array.isArray(f.geometry.coordinates) &&
          f.geometry.coordinates.length > 0
        );
      } catch {
        return false;
      }
    });

    if (validFeatures.length === 0) {
      throw new Error('No features with valid geometries found');
    }

    // 3. Configuración inicial
    const zip = new JSZip();
    const baseName = (layerName || 'export').replace(/[^\w]/g, '_').toLowerCase().slice(0, 50);
    const folder = zip.folder(baseName) || zip;

    // 4. Generar shapefiles base
    let shpZip;
    try {
      shpZip = await shpwrite.zip(
        { type: 'FeatureCollection', features: validFeatures },
        { base64: true }
      );
    } catch (err) {
      console.error('shpwrite error:', err);
      throw new Error('Failed to generate base shapefiles');
    }

    // 5. Procesar el ZIP generado
    const tempZip = new JSZip();
    try {
      await tempZip.loadAsync(base64ToArrayBuffer(shpZip));
    } catch (err) {
      throw new Error('Generated ZIP file is corrupt');
    }

    // 6. Extraer archivos con validación robusta
    const extractFile = async (zip, ext) => {
      const filename = Object.keys(zip.files).find(f => 
        f.toLowerCase().endsWith(ext.toLowerCase())
      );
      
      if (!filename) {
        throw new Error(`Required ${ext} file not found in generated ZIP`);
      }

      const file = zip.file(filename);
      if (!file) {
        throw new Error(`Found ${ext} file but cannot access it`);
      }

      try {
        return await file.async('arraybuffer');
      } catch (err) {
        throw new Error(`Failed to read ${ext} file: ${err.message}`);
      }
    };

    let shpBuffer, shxBuffer;
    try {
      [shpBuffer, shxBuffer] = await Promise.all([
        extractFile(tempZip, '.shp'),
        extractFile(tempZip, '.shx')
      ]);
    } catch (err) {
      throw new Error(`Failed to extract required files: ${err.message}`);
    }

    // 7. Generar DBF con codificación especificada
    let dbfBuffer;
    try {
      const dbfGenerator = new DBFGenerator(validFeatures);
      dbfBuffer = dbfGenerator.createDBFBuffer();
    } catch (err) {
      throw new Error(`DBF generation failed: ${err.message}`);
    }

    // 8. Construir ZIP final
    folder.file(`${baseName}.shp`, shpBuffer);
    folder.file(`${baseName}.shx`, shxBuffer);
    folder.file(`${baseName}.dbf`, dbfBuffer);
    folder.file(`${baseName}.cpg`, encoding); // Usar la codificación especificada
    folder.file(`${baseName}.prj`, 
      'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
    );

    // 9. Generar resultado final
    const result = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      platform: 'DOS', // Para máxima compatibilidad
    });

    // 10. Validar el resultado antes de enviar
    if (!result || result.byteLength === 0) {
      throw new Error('Generated ZIP file is empty');
    }

    self.postMessage({ 
      type: 'done', 
      zip: result,
      metadata: {
        layerName: baseName,
        featureCount: validFeatures.length,
        encoding: encoding
      }
    });

  } catch (err) {
    console.error('Worker error:', err);
    self.postMessage({
      type: 'error',
      message: err.message,
      stack: err.stack,
      details: {
        inputValidation: {
          featuresReceived: geojson?.features?.length,
          validFeatures: geojson?.features?.filter(f => 
            f?.geometry?.coordinates
          )?.length
        }
      }
    });
  }
};

function base64ToArrayBuffer(b64) {
  if (typeof b64 !== 'string') {
    throw new TypeError('Base64 input must be a string');
  }

  const cleanB64 = b64.replace(/\s/g, '');
  if (!cleanB64) {
    throw new Error('Empty base64 string');
  }

  try {
    const binary = atob(cleanB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (err) {
    throw new Error(`Base64 decoding failed: ${err.message}`);
  }
}