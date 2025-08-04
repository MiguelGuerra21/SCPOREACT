/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
/* eslint-disable no-console */
/* global JSZip, shpwrite */

importScripts('/libs/shpwrite.js', '/libs/jszip.js');

function base64ToArrayBuffer(b64) {
  const bin = atob(b64),
        buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    buf[i] = bin.charCodeAt(i);
  }
  return buf.buffer;
}

self.onmessage = async (e) => {
  const { geojson, dateFieldNames } = e.data;
  console.log("Worker recibe dateFieldNames:", dateFieldNames);

  // 1) Construir el map de tipos Date
  const types = {};
  (dateFieldNames || []).forEach(name => {
    types[name] = 'Date';
  });
  console.log("Worker types para shpwrite:", types);

  try {
    // 2) Generar el ZIP en base64, forzando CP1252 y los tipos Date
    const zipString = await shpwrite.zip(geojson, {
      base64: true,
      dbf:   { encoding: 'CP1252' },
      types
    });

    // 3) Cargar con JSZip
    const zip = new JSZip();
    await zip.loadAsync(base64ToArrayBuffer(zipString));

    // 4) Añadir el archivo .cpg indicando CP1252
    zip.file('output.cpg', '1252');

    // 5) Generar el blob final y devolverlo
    const blob = await zip.generateAsync({ type: 'blob' });
    postMessage({ type: 'done', blob });
    console.log("Tipo del campo antes del zip:", typeof e.properties["Fecha ET01"]);
    console.log("Es Date:", e.properties["Fecha ET01"] instanceof Date);
  }
  catch (err) {
    console.error("Worker Error:", err);
    postMessage({ type: 'error', message: err.message });
  }
};
