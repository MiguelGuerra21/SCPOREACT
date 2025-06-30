const { app, BrowserWindow } = require('electron');
const path = require('path');

function createMainWindow() {

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      sandbox: false
    }
  });

  const indexHtmlPath = path.join(__dirname, '../build/index.html');

  // Verifica que el archivo exista antes de cargarlo (opcional pero útil)
  const fs = require('fs');
  if (!fs.existsSync(indexHtmlPath)) {
    return;
  }

  mainWindow.loadFile(indexHtmlPath)
    .then(() => {
      console.log('index.html cargado correctamente');
    })
    .catch((err) => {
      console.error('Error al cargar index.html:', err);
    });
}

app.whenReady().then(() => {
  console.log('App lista');
  createMainWindow();
});

app.on('window-all-closed', () => {
  console.log('Todas las ventanas cerradas');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  console.log('Activando app');
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});