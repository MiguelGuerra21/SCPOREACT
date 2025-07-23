/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
importScripts('/libs/shpwrite.js');

self.onmessage = async (e) => {
  const { geojson } = e.data;

  try {
    // Opción base64
    let zipString = self.shpwrite.zip(geojson, { base64: true });

    // Si es una promesa, espera el resultado
    if (zipString instanceof Promise) {
      zipString = await zipString;
    }

    // Decodifica base64 a ArrayBuffer
    function base64ToArrayBuffer(base64) {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    const zipBlob = new Blob([base64ToArrayBuffer(zipString)], { type: "application/zip" });

    postMessage({ type: "done", blob: zipBlob });
  
  } catch (err) {
    console.error("Worker: error generando shapefile", err);
    postMessage({ 
      type: "error", 
      message: err.message,
      stack: err.stack 
    });
  }
};
