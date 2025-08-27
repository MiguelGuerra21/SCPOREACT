// src/utils/URLConfig.js
import { Capacitor } from "@capacitor/core";

/**
 * Config de backend para desarrollo/producción.
 * Usa variables de entorno REACT_APP_EXPORT_* para sobreescribir por máquina.
 *
 * REACT_APP_EXPORT_DEV_IP     -> IP usada en web/desktop (por defecto localhost)
 * REACT_APP_EXPORT_ANDROID_IP -> IP para Android (emulador = 10.0.2.2, genymotion = 10.0.3.2)
 * REACT_APP_EXPORT_PORT       -> puerto del backend (por defecto 3002)
 * REACT_APP_USE_HTTPS         -> "true" si quieres HTTPS (dev)
 */

const env = typeof process !== "undefined" ? process.env : {};
const useHttpsEnv = (env.REACT_APP_USE_HTTPS || "").toLowerCase() === "true";
const defaultPort = env.REACT_APP_EXPORT_PORT || "3002";
const loggerPort = env.REACT_APP_LOGGER_PORT || "3001";
const devIpEnv = env.REACT_APP_EXPORT_DEV_IP || "localhost";
const androidIpEnv = env.REACT_APP_EXPORT_ANDROID_IP || "10.0.2.2";

let platform;
try {
  platform = (typeof Capacitor !== "undefined" && Capacitor.getPlatform) ? Capacitor.getPlatform() : (typeof navigator !== "undefined" && /Android|iPhone|iPod|iPad/.test(navigator.userAgent) ? "web" : "web");
} catch (e) {
  platform = "web";
}

// Decide protocolo: si la página actual es https -> por defecto usar https en web,
// pero en desarrollo forzamos http si REACT_APP_USE_HTTPS !== true
const pageIsHttps = (typeof window !== "undefined" && window.location && window.location.protocol === "https:");
const isDev = process.env.NODE_ENV === "development";
const shouldUseHttps = useHttpsEnv || (pageIsHttps && !isDev);

const scheme = shouldUseHttps ? "https" : "http";

function getBackendUrl() {
  if (platform === "android" || platform === "ios") {
    // En emulador, si quieres usar emulator mapping deja 10.0.2.2; para genymotion 10.0.3.2
    const ip = androidIpEnv;
    return `${scheme}://${ip}:${defaultPort}`;
  } else if (platform === "electron") {
    const ip = devIpEnv;
    return `${scheme}://${ip}:${defaultPort}`;
  } else { // web
    // En web, si estás usando CRA dev server y quieres el mismo host que la página:
    if (typeof window !== "undefined") {
      // Si devIpEnv === 'localhost' preferir window.location.host pero con puerto de export
      if (devIpEnv === "localhost") {
        const host = window.location.hostname;
        return `${window.location.protocol}//${host}:${defaultPort}`;
      }
    }
    return `${scheme}://${devIpEnv}:${defaultPort}`;
  }
}
function getLoggerUrl() {
  if (platform === "android" || platform === "ios") {
    const ip = androidIpEnv;
    return `${scheme}://${ip}:${loggerPort}`;
  } else if (platform === "electron") {
    const ip = devIpEnv;
    return `${scheme}://${ip}:${loggerPort}`;
  } else {
    if (typeof window !== "undefined") {
      if (devIpEnv === "localhost") {
        const host = window.location.hostname;
        return `${window.location.protocol}//${host}:${loggerPort}`;
      }
    }
    return `${scheme}://${devIpEnv}:${loggerPort}`;
  }
}

const LOGGER_URL = getLoggerUrl();
const BACKEND_URL = getBackendUrl();

export default { BACKEND_URL, LOGGER_URL, platform, scheme };
export { BACKEND_URL, LOGGER_URL, platform, scheme, getBackendUrl, getLoggerUrl };
