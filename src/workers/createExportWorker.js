// src/workers/createExportWorker.js
// Crea un Worker apuntando al archivo estático en public/export-worker.js
export async function createExportWorker({ staticPath = '/export-worker.js' } = {}) {
  try {
    const staticWorker = new Worker(staticPath); // compatible con importScripts dentro del worker
    console.info('[createExportWorker] static worker created from', staticPath);
    return staticWorker;
  } catch (err) {
    console.error('[createExportWorker] failed to create static worker:', err);
  }

  // Fallback "fake" para no romper la app
  const fake = {
    onmessage: null,
    onerror: null,
    postMessage(payload) {
      setTimeout(() => {
        if (typeof fake.onmessage === 'function') {
          fake.onmessage({ data: { type: 'error', message: 'Worker unavailable (fallback)', payload } });
        }
      }, 0);
    },
    terminate() {}
  };
  return fake;
}

export default createExportWorker;
