// electron.js (modificado para servir build/ por HTTP y mantener tu configuración)
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const fs = require('fs');

// Variable para mantener la referencia global de la ventana y del servidor
let mainWindow;
let staticServer;

// Helper: crea el BrowserWindow con tus webPreferences originales
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets', 'logo.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false
    }
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
        "default-src 'self' 'unsafe-inline' data: blob: https://*.arcgis.com https://*.arcgisonline.com; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
        "style-src 'self' 'unsafe-inline' https:; " +
        "img-src 'self' data: blob: https:; " +
        "connect-src 'self' http://127.0.0.1:* https:; " +
        "worker-src 'self' blob: https:; " +
        "font-src 'self' data: https:; " +
        "frame-src 'self' https:;"
        ]
      }
    });
  });

  // Abrir DevTools anclado a la ventana (muestra consola/Network/Errors)
  try {
    // 'right' lo ancla a la derecha dentro de la ventana; usa 'bottom' si prefieres abajo
    mainWindow.webContents.openDevTools({ mode: 'right' });
  } catch (e) {
    console.warn('No se pudo abrir DevTools automáticamente:', e);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Crea y arranca un server express que sirva build/ y build/tiles
async function startStaticServerAndLoad() {
  const buildPath = path.join(__dirname, '../build');
  const indexHtmlPath = path.join(buildPath, 'index.html');

  if (!fs.existsSync(buildPath) || !fs.existsSync(indexHtmlPath)) {
    console.error('Build folder o index.html no encontrado. Ejecuta "npm run build" antes de empaquetar.');
    return;
  }

  const appStatic = express();
  

  // parse JSON bodies (necesario para /api/log)
  appStatic.use(express.json({ limit: '1mb' }));

  // health endpoint (ya lo tenías; lo dejo)
  appStatic.get('/api/ping', (req, res) => {
    res.status(200).json({ ok: true, ts: Date.now() });
  });

  // endpoint para recibir logs desde SCPOLogger
  appStatic.post('/api/log', (req, res) => {
    try {
      const msg = req.body && (req.body.message || req.body.message === "" ? req.body.message : JSON.stringify(req.body));
      const line = `${new Date().toISOString()} ${msg}\n`;

      // 1) Mostrar en consola (DevTools y terminal del main)
      console.log('[SCPOLogger]', line.trim());

      // 2) (Opcional pero útil) Guardar en fichero dentro del userData de la app
      try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, 'scpo.log');
        fs.appendFile(logFile, line, (err) => {
          if (err) console.warn('[SCPOLogger] fallo al escribir log:', err);
        });
      } catch (fsErr) {
        console.warn('[SCPOLogger] no se pudo escribir en disco:', fsErr);
      }

      // responder OK al cliente
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[SCPOLogger] /api/log error:', err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  appStatic.get('/api/ping', (req, res) => {
    res.status(200).json({ ok: true, ts: Date.now() });
  });
  // Servir build como root
  appStatic.use(express.static(buildPath, {
    // Opciones si quisieras cache control, etc.
  }));

  // Asegura que /tiles sirva la carpeta build/tiles si existe
  const tilesPath = path.join(buildPath, 'tiles');
  if (fs.existsSync(tilesPath)) {
    appStatic.use('/tiles', express.static(tilesPath));
  } else {
    // No existe carpeta tiles; aún así seguimos sirviendo el build
    console.warn('No existe la carpeta build/tiles — asegúrate de copiar tiles/ en el build si las necesitas.');
  }

  // Arrancar server en puerto libre (0)
  return new Promise((resolve, reject) => {
    staticServer = appStatic.listen(0, '127.0.0.1', () => {
      const port = staticServer.address().port;
      const url = `http://127.0.0.1:${port}`;
      console.log(`Static server listening at ${url}`);

      // Crea la ventana si no existe
      if (!mainWindow) createMainWindow();

      // Cargar la app vía HTTP (evita file:// issues)
      mainWindow.loadURL(url)
        .then(() => {
          console.log('App cargada vía HTTP:', url);
          resolve();
        })
        .catch((err) => {
          console.error('Error cargando la app vía HTTP:', err);
          reject(err);
        });
    });

    staticServer.on('error', (err) => {
      console.error('Error arrancando static server:', err);
      reject(err);
    });
  });
}

// Función principal de creación/arranque (combinada para dev y prod)
async function createApp() {

  // Si prefieres fallback a file:// en caso de fallo del servidor, podrías hacerlo.
  // Aquí intento arrancar el server y cargar vía HTTP. Si falla, intento cargar index.html local.
  try {
    await startStaticServerAndLoad();
  } catch (err) {
    console.warn('Fallo al arrancar servidor estático. Intentando fallback a loadFile (file://) ...', err);

    // Fallback: intenta cargar index.html directamente (como tenías originalmente)
    const buildIndex = path.join(__dirname, '../build/index.html');
    if (fs.existsSync(buildIndex)) {
      if (!mainWindow) createMainWindow();
      mainWindow.loadFile(buildIndex)
        .then(() => console.log('App cargada vía file:// (fallback)'))
        .catch(e => console.error('Error cargando app vía file:// (fallback):', e));
    } else {
      console.error('No se pudo cargar la app: ni server HTTP ni archivo build/index.html están disponibles.');
    }
  }

  if (process.env.NODE_ENV === 'development' && mainWindow) {
    mainWindow.webContents.openDevTools();
  }
}

// Eventos del ciclo de vida de la app
app.on('ready', createApp);

app.on('window-all-closed', () => {
  // Cerrar el server si está corriendo
  if (staticServer && typeof staticServer.close === 'function') {
    try {
      staticServer.close(() => console.log('Static server cerrado'));
    } catch (err) {
      console.warn('Error cerrando static server:', err);
    }
    staticServer = null;
  }

  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createApp();
  }
});

// Manejar nuevas ventanas (evitar que se abran)
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Manejo de salidas forzadas (por si empaquetas)
app.on('will-quit', () => {
  if (staticServer && typeof staticServer.close === 'function') {
    try { staticServer.close(); } catch (e) { /* ignore */ }
  }
});
