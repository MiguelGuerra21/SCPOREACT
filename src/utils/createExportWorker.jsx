// src/utils/createExportWorker.js
export async function createExportWorker() {
  const isElectron = window && window.process && window.process.type;
  console.log('Creating worker. Electron detected:', isElectron);
  
  try {
    if (isElectron) {
      console.log('Creating Electron worker...');
      // En Electron, usar diferentes rutas según el entorno
      const workerPath = process.env.NODE_ENV === 'production' 
        ? './workers/exportWorker.js'
        : '../src/workers/exportWorker.js';
      
      console.log('Worker path:', workerPath);
      const worker = new Worker(workerPath);
      console.log('Electron worker created successfully');
      return worker;
    } else {
      console.log('Creating browser worker...');
      // En navegador normal
      const worker = new Worker(new URL('../workers/exportWorker.js', import.meta.url));
      console.log('Browser worker created successfully');
      return worker;
    }
  } catch (err) {
    console.error('Primary worker creation failed:', err);
    
    // Fallback: crear worker desde blob
    try {
      console.log('Trying blob fallback...');
      let workerUrl;
      
      if (isElectron) {
        workerUrl = process.env.NODE_ENV === 'production' 
          ? './workers/exportWorker.js'
          : '../src/workers/exportWorker.js';
      } else {
        workerUrl = new URL('../workers/exportWorker.js', import.meta.url);
      }
      
      console.log('Fetching worker from:', workerUrl);
      const resp = await fetch(workerUrl);
      const text = await resp.text();
      const blob = new Blob([text], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      console.log('Blob worker created successfully');
      return worker;
    } catch (fetchErr) {
      console.error('All worker creation methods failed:', fetchErr);
      throw new Error(`Failed to create worker: ${fetchErr.message}`);
    }
  }
}