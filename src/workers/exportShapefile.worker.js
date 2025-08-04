/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
/* eslint-disable no-console */
/* global JSZip, shpwrite */

importScripts('/libs/shpwrite.js','/libs/jszip.js');

function base64ToArrayBuffer(b64) {
  const bin = atob(b64),
        buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    buf[i] = bin.charCodeAt(i);
  }
  return buf.buffer;
}

self.onmessage = async (e) => {
  const { geojson } = e.data;

  try {
    // aquí no necesitamos reconvertir nada:
    // exportamos directamente strings en DBF (no forzamos tipos Date)
    const zipString = await shpwrite.zip(geojson, {
      base64: true,
      dbf:    { encoding: 'CP1252' },
      // no pasamos `types` para fecha
    });

    const zip = new JSZip();
    await zip.loadAsync(base64ToArrayBuffer(zipString));

    // indicamos codificación
    zip.file('output.cpg','CP1252');

    const blob = await zip.generateAsync({ type:'blob' });
    postMessage({ type:'done', blob });
  }
  catch (err) {
    console.error("Worker Error:", err);
    postMessage({ type:'error', message: err.message });
  }
};