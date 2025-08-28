// src/utils/URLConfig.js
import { Capacitor } from "@capacitor/core";

/**
 * URLConfig flexible:
 * - Por defecto fuerza HTTP en desarrollo (para evitar mixed content en dev).
 * - Para activar HTTPS pones REACT_APP_USE_HTTPS=true.
 * - Para desactivar el FORCE_HTTP pones REACT_APP_FORCE_HTTP=false.
 */

const env = typeof process !== "undefined" ? process.env : {};
const useHttpsEnv = (env.REACT_APP_USE_HTTPS || "").toLowerCase() === "true"; // true => prefer https
const forceHttpEnv = (env.REACT_APP_FORCE_HTTP || "").toLowerCase();
const forceHttp = forceHttpEnv === "" ? true : (forceHttpEnv === "true"); // por defecto true en dev
const defaultPort = env.REACT_APP_EXPORT_PORT || "3002";
const loggerPort = env.REACT_APP_LOGGER_PORT || "3001";
const devIpEnv = env.REACT_APP_EXPORT_DEV_IP || "localhost";
const androidIpEnv = env.REACT_APP_EXPORT_ANDROID_IP || "10.0.2.2";

let platform;
try {
  platform =
    (typeof Capacitor !== "undefined" && Capacitor.getPlatform)
      ? Capacitor.getPlatform()
      : (typeof navigator !== "undefined" && /Android|iPhone|iPod|iPad/.test(navigator.userAgent) ? "web" : "web");
} catch (e) {
  platform = "web";
}

// Detectores
const pageIsHttps = (typeof window !== "undefined" && window.location && window.location.protocol === "https:");
const isDev = process.env.NODE_ENV === "development";

// Decide scheme para web y mobile
let schemeWeb = (useHttpsEnv || (pageIsHttps && !isDev)) ? "https" : "http";
if (forceHttp) schemeWeb = "http";

let schemeMobile = forceHttp ? "http" : (useHttpsEnv ? "https" : "http");

const scheme = { web: schemeWeb, mobile: schemeMobile };

function getBackendUrl() {
  if (platform === "android" || platform === "ios") {
    const ip = androidIpEnv;
    return `${schemeMobile}://${ip}:${defaultPort}`;
  } else if (platform === "electron") {
    const ip = devIpEnv;
    return `${schemeWeb}://${ip}:${defaultPort}`;
  } else { // web
    if (typeof window !== "undefined") {
      if (devIpEnv === "localhost") {
        const host = window.location.hostname;
        return `${schemeWeb}://${host}:${defaultPort}`;
      }
    }
    return `${schemeWeb}://${devIpEnv}:${defaultPort}`;
  }
}

function getLoggerUrl() {
  if (platform === "android" || platform === "ios") {
    const ip = androidIpEnv;
    return `${schemeMobile}://${ip}:${loggerPort}`;
  } else if (platform === "electron") {
    const ip = devIpEnv;
    return `${schemeWeb}://${ip}:${loggerPort}`;
  } else {
    if (typeof window !== "undefined") {
      if (devIpEnv === "localhost") {
        const host = window.location.hostname;
        return `${schemeWeb}://${host}:${loggerPort}`;
      }
    }
    return `${schemeWeb}://${devIpEnv}:${loggerPort}`;
  }
}

const BACKEND_URL = getBackendUrl();
const LOGGER_URL = getLoggerUrl();

export default { BACKEND_URL, LOGGER_URL, platform, scheme };
export { BACKEND_URL, LOGGER_URL, platform, scheme, getBackendUrl, getLoggerUrl };
