// src/utils/SCPOLogger.js
import URLConfig from './URLConfig'; // ajusta la ruta si hace falta

const LOG_FILENAME = 'SCPOLogs.txt';

class SCPOLogger {
  static enabled = false;
  static mode = 'unknown'; // 'remote' | 'local-capacitor' | 'local-web' | 'disabled'
  static logFile = LOG_FILENAME;

  // ---------- helpers de detección ----------
  static isCapacitorAvailable() {
    try {
      return typeof window !== 'undefined' && !!window.Capacitor && typeof window.Capacitor.getPlatform === 'function';
    } catch { return false; }
  }
  static isCapacitorMobile() {
    try {
      return SCPOLogger.isCapacitorAvailable() && window.Capacitor.getPlatform() !== 'web';
    } catch { return false; }
  }
  static isAndroid() {
    try {
      return SCPOLogger.isCapacitorAvailable() && window.Capacitor.getPlatform() === 'android';
    } catch { return false; }
  }
  static isElectron() {
    try {
      if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron')) return true;
      return typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
    } catch { return false; }
  }
  static isBrowser() {
    try { return typeof window !== 'undefined' && !SCPOLogger.isCapacitorMobile(); } catch { return false; }
  }

  // ---------- URL / remote logger ----------
  static _loggerBase() {
    const env = (typeof process !== 'undefined' ? process.env : {}) || {};
    if (env.REACT_APP_LOGGER_BASE_URL) return env.REACT_APP_LOGGER_BASE_URL.replace(/\/$/, '');
    if (URLConfig && URLConfig.LOGGER_URL) return URLConfig.LOGGER_URL.replace(/\/$/, '');

    // si es mobile en emulador, apuntar al host (10.0.2.2)
    if (SCPOLogger.isCapacitorMobile()) {
      if (SCPOLogger.isAndroid()) return 'http://10.0.2.2:3001';
      return 'http://localhost:3001';
    }

    return 'http://localhost:3001';
  }

  static _makeUrl(path) {
    const base = (URLConfig && URLConfig.LOGGER_URL) ? URLConfig.LOGGER_URL.replace(/\/$/, '') : SCPOLogger._loggerBase();
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  static async init() {
    // intenta ping remoto primero
    try {
      const pingUrl = SCPOLogger._makeUrl('/api/ping');
      const res = await fetch(pingUrl, { method: 'GET', credentials: 'omit', cache: 'no-cache' });
      if (res && (res.ok || res.status === 204 || res.type === 'opaque')) {
        SCPOLogger.enabled = true;
        SCPOLogger.mode = 'remote';
        console.info('[SCPOLogger] remote logger reachable:', pingUrl);
        return;
      }
    } catch (err) {
      console.info('[SCPOLogger] remote logger unreachable:');
      // no pasa nada; seguimos a fallbacks
    }

    // Fallbacks por plataforma
    if (SCPOLogger.isCapacitorMobile()) {
      SCPOLogger.enabled = true;
      SCPOLogger.mode = 'local-capacitor';
      console.info('[SCPOLogger] using local-capacitor');
      return;
    }

    // Web fallback (localStorage / File System Access API)
    SCPOLogger.enabled = true;
    SCPOLogger.mode = 'local-web';
    console.info('[SCPOLogger] using local-web fallback (localStorage/FileSystemAccess when user consents)');
  }

  // ---------- Remote post ----------
  static async _postRemote(line) {
    try {
      const url = SCPOLogger._makeUrl('/api/log');
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'X-SCPO-Logger': 'true' },
        body: JSON.stringify({ message: line })
      });
      return !!(res && (res.ok || res.status === 204 || res.type === 'opaque'));
    } catch (err) {
      return false;
    }
  }

  // helper: devuelve ISO-ish en hora de Madrid (yyyy-mm-ddTHH:MM:SS)
  static madridTimestampISO(date = new Date()) {
    // Formato 'sv-SE' produce 'YYYY-MM-DD HH:mm:ss' con hour12:false en muchos navegadores.
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(date); // -> "YYYY-MM-DD HH:mm:ss"

    // Convertir espacio a T para aproximar ISO
    return parts.replace(' ', 'T');
  }


  // ---------- Capacitor local write ----------
  static async _writeLocalCapacitor(line) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

      // candidates: Documents/exports (preferido), ExternalStorage si está (Android), Data (si todo falla)
      const candidates = [
        { dir: Directory.Documents, path: `exports/${SCPOLogger.logFile}` },
        { dir: Directory.ExternalStorage ?? Directory.Documents, path: `exports/${SCPOLogger.logFile}` },
        { dir: Directory.Data, path: SCPOLogger.logFile }
      ];

      for (const c of candidates) {
        try {
          // intentar append; si falla, intentar write (creación)
          try {
            await Filesystem.appendFile({ path: c.path, data: line + '\n', directory: c.dir, encoding: Encoding.UTF8 });
            return { ok: true, path: c.path, directory: c.dir };
          } catch (_) {
            await Filesystem.writeFile({ path: c.path, data: line + '\n', directory: c.dir, encoding: Encoding.UTF8, recursive: true });
            return { ok: true, path: c.path, directory: c.dir };
          }
        } catch (e) {
          // intentar siguiente candidato
        }
      }
      return { ok: false, error: 'All capacitor write attempts failed' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // ---------- Web local fallback: localStorage ----------
  static _writeLocalWeb(line) {
    try {
      const key = 'SCPO_LOGS';
      const cur = localStorage.getItem(key);
      const arr = cur ? JSON.parse(cur) : [];
      arr.push({ t: Date.now(), m: line });
      if (arr.length > 2000) arr.splice(0, arr.length - 2000); // limitar tamaño
      localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (err) {
      return false;
    }
  }

  // ---------- Web: File System Access API (requiere gesto del usuario) ----------
  static async writeWebViaFileSystemAccess(line, fileHandle = null) {
    try {
      if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
        return { ok: false, error: 'File System Access API not available' };
      }

      let handle = fileHandle;
      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName: SCPOLogger.logFile,
          types: [{ description: 'Text files', accept: { 'text/plain': ['.txt'] } }]
        });
      }
      const writable = await handle.createWritable();
      await writable.write(line + '\n');
      await writable.close();
      return { ok: true, handle };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // ---------- Public API ----------
  static async log({ timestamp, user = 'Usuario', action = '', info = '' } = {}) {
    const ts = timestamp || SCPOLogger.madridTimestampISO(new Date());
    const infoStr = (typeof info === 'string') ? info : (() => { try { return JSON.stringify(info); } catch { return String(info); } })();
    const line = `[${ts}] | ${user} | ${action} | ${infoStr}`;

    // inicializa si hace falta
    if (!SCPOLogger.enabled) {
      try { await SCPOLogger.init(); } catch (e) { /* continue */ }
    }

    if (!SCPOLogger.enabled) {
      console.log('[SCPOLogger - console fallback]', line);
      return;
    }

    // 1) intento remoto
    if (SCPOLogger.mode === 'remote') {
      const ok = await SCPOLogger._postRemote(line);
      if (ok) return;
      // si falla, degradar modo según plataforma
      if (SCPOLogger.isCapacitorMobile()) SCPOLogger.mode = 'local-capacitor';
      else SCPOLogger.mode = 'local-web';
    }

    // 2) capacitor
    if (SCPOLogger.mode === 'local-capacitor') {
      try {
        const res = await SCPOLogger._writeLocalCapacitor(line);
        if (res && res.ok) return;
        console.warn('[SCPOLogger] capacitor local write failed', res && res.error);
      } catch (e) {
        console.warn('[SCPOLogger] capacitor write exception', e);
      }
    }

    // 3) web fallback
    if (SCPOLogger.mode === 'local-web') {
      const ok = SCPOLogger._writeLocalWeb(line);
      if (ok) return;
      // último recurso: consola
      console.log('[SCPOLogger - console fallback]', line);
      return;
    }

    // si no encaja nada, consola
    console.log('[SCPOLogger - final fallback]', line);
  }
}

export default SCPOLogger;
