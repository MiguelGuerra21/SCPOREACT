// src/utils/createExportWorker.js
export async function createExportWorker() {
  try {
    // Intento moderno: module worker transformado por bundler (Webpack5 / Vite)
    return new Worker(new URL('../workers/exportWorker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    // Fallback: crear worker desde blob (carga el archivo como texto)
    // Esto requiere que el bundler ponga el archivo worker en los assets (por ejemplo, Vite/Webpack ocurre).
    try {
      const resp = await fetch(new URL('../workers/exportWorker.js', import.meta.url));
      const text = await resp.text();
      const blob = new Blob([text], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    } catch (fetchErr) {
      throw new Error(`Failed to create worker (both module and blob fallback failed): ${fetchErr.message}`);
    }
  }
}
