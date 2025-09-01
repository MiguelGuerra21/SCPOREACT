// server/logger.js
import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();

const DEFAULT_LOG_DIR = process.env.LOG_DIR || path.resolve('./logs');
const LOG_FILENAME = process.env.LOG_FILE || 'SCPOLogs.txt';
const LOG_PATH = process.env.LOG_PATH || path.join(DEFAULT_LOG_DIR, LOG_FILENAME);
const PORT = parseInt(process.env.PORT || '3001', 10);

// crear carpeta si no existe (permissions: asegúrate en Docker que el usuario tenga permisos)
try {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
} catch (err) {
  console.error('Could not create log directory:', err);
  process.exit(1);
}

app.use(cors());           // en prod restringe orígenes
app.use(express.json({ limit: '1mb' }));

app.get("/api/ping", (_req, res) => res.sendStatus(204));

app.post("/api/log", (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ ok: false, error: 'missing message' });

  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;

  fs.appendFile(LOG_PATH, line, (err) => {
    if (err) {
      console.error("Failed writing log:", err);
      return res.status(500).json({ ok: false, error: 'write_failed' });
    }
    return res.status(204).end();
  });
});

// opcional: endpoint para leer/descargar el log (cuidado con permisos y tamaño)
app.get("/api/logs/download", (req, res) => {
  if (!fs.existsSync(LOG_PATH)) return res.status(404).json({ ok: false });
  res.download(LOG_PATH, LOG_FILENAME, (err) => {
    if (err) console.warn('Download error:', err);
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Logger listening on :${PORT}, writing to ${LOG_PATH}`);
});
