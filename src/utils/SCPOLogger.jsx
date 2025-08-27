// src/utils/SCPOLogger.js
import URLConfig from '../utils/URLConfig'; // ajusta la ruta si hace falta

const LOG_FILE = 'SCPOLogs.txt';

class SCPOLogger {
  static enabled = false;
  static mode = 'unknown';
  static logFile = LOG_FILE;

  static isMobilePlatform() {
    try {
      return typeof window !== 'undefined' &&
             window.Capacitor &&
             typeof window.Capacitor.getPlatform === 'function' &&
             window.Capacitor.getPlatform() !== 'web';
    } catch { return false; }
  }

  // Decide la base URL para el logger (LAN, emulador, físico, etc.)
  static _loggerBase() {
    // override por variable de entorno (útil en físico/LAN/prod)
    const env = (typeof process !== 'undefined' ? process.env : {}) || {};
    if (env.REACT_APP_LOGGER_BASE_URL) {
      return env.REACT_APP_LOGGER_BASE_URL.replace(/\/$/, '');
    }

    // si hay URLConfig definida, úsala
    if (URLConfig && URLConfig.LOGGER_URL) {
      return URLConfig.LOGGER_URL.replace(/\/$/, '');
    }

    // detección plataforma
    if (SCPOLogger.isMobilePlatform()) {
      const platform = window.Capacitor.getPlatform();
      if (platform === 'android') {
        // emulador Android -> host machine
        return 'http://10.0.2.2:3001';
      }
      return 'http://localhost:3001'; // iOS sim o fallback
    }

    // desktop / navegador
    return 'http://localhost:3001';
  }

  // Construye URL completa a partir de path
  static _makeUrl(path) {
    let base = null;

    // primero mira si tenemos LOGGER_URL en la config
    if (URLConfig && URLConfig.LOGGER_URL) {
      base = URLConfig.LOGGER_URL.replace(/\/$/, '');
    } else {
      // fallback al viejo _loggerBase (localhost:3001, android/ip, etc.)
      base = SCPOLogger._loggerBase();
    }

  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

  static async init() {
    try {
      console.info('[SCPOLogger] document.cookie length:', (document.cookie || '').length);
    } catch (_) {}

    const pingCandidates = [ SCPOLogger._makeUrl('/api/ping') ];

    for (const url of pingCandidates) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-cache'
        });
        if (res && (res.ok || res.type === 'opaque' || res.status === 204)) {
          SCPOLogger.enabled = true;
          SCPOLogger.mode = 'remote';
          console.info('[SCPOLogger] ping OK -> modo remote', url, 'res.type=', res.type, 'status=', res.status);
          return;
        }
      } catch (err) {
        console.warn('[SCPOLogger] ping failed for', url, err?.message || err);
      }
    }

    if (SCPOLogger.isMobilePlatform()) {
      SCPOLogger.enabled = true;
      SCPOLogger.mode = 'local';
      console.info('[SCPOLogger] endpoint no accesible - usando modo local (Filesystem)');
      return;
    }

    SCPOLogger.enabled = false;
    SCPOLogger.mode = 'disabled';
    console.info('[SCPOLogger] endpoint no accesible y no es móvil -> logger deshabilitado');
  }

  static async _writeLocalLine(line) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      try {
        await Filesystem.appendFile({
          path: SCPOLogger.logFile,
          data: line + '\n',
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
      } catch (_) {
        await Filesystem.writeFile({
          path: SCPOLogger.logFile,
          data: line + '\n',
          directory: Directory.Data,
          encoding: Encoding.UTF8,
          recursive: true
        });
      }
      return true;
    } catch (err) {
      console.error('[SCPOLogger] Error al escribir log local:', err);
      return false;
    }
  }

  static async log({ timestamp, user, action, info }) {
    const infoStr = (typeof info === 'string')
      ? info
      : (() => { try { return JSON.stringify(info); } catch { return String(info); } })();

    const line = `[${timestamp}] | ${user} | ${action} | ${infoStr}`;

    if (!SCPOLogger.enabled) {
      try { await SCPOLogger.init(); } catch {}
      if (!SCPOLogger.enabled) {
        console.log('[SCPOLogger - fallback console]', line);
        return;
      }
    }

    if (SCPOLogger.mode === 'remote') {
      const logUrl = SCPOLogger._makeUrl('/api/log');
      try {
        const res = await fetch(logUrl, {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'X-SCPO-Logger': 'true'
          },
          body: JSON.stringify({ message: line })
        });

        if (res && (res.ok || res.status === 204 || res.type === 'opaque')) return;

        console.warn('[SCPOLogger] server returned', res && res.status);
        if (res && (res.status === 431 || res.status >= 400)) {
          SCPOLogger.mode = SCPOLogger.isMobilePlatform() ? 'local' : 'disabled';
        }
      } catch (err) {
        console.warn('[SCPOLogger] fetch to log failed, fallback', err);
        SCPOLogger.mode = SCPOLogger.isMobilePlatform() ? 'local' : 'disabled';
      }
    }

    if (SCPOLogger.mode === 'local') {
      const ok = await SCPOLogger._writeLocalLine(line);
      if (!ok) SCPOLogger.mode = 'disabled';
      return;
    }

    console.log('[SCPOLogger - disabled] ', line);
  }
}

export default SCPOLogger;
