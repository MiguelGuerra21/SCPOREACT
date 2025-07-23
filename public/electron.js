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
    })
    .catch((err) => {
    });
}

app.whenReady().then(() => {
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});