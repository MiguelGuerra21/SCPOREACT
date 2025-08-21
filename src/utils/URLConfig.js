// URLConfig.js
import { Capacitor } from "@capacitor/core";

const platform = Capacitor.getPlatform();

// IP de tu máquina en la LAN
const EXPORT_LOCAL_IP = "192.168.3.173"; // <-- cambia por tu IP real de cada máquina
const EXPORT_ANDROID_IP = "100.78.179.248"; // URL para móvil personal
const EXPORT_DEV_IP = "localhost"; // URL local para desarrollo
const EXPORT_BACKEND_URL_PROD = "api.example.com"; // URL de producción
const EXPORT_BACKEND_URL_STAGING = "staging.example.com" // URL de staging

// URLs base según plataforma
const BACKEND_URL = (() => {
  if (platform === "android" || platform === "ios") {
    // Android/iOS (Capacitor) suele usar la IP de la máquina para acceder al backend local
    return `http://${EXPORT_ANDROID_IP}:3002`;
  } else if (platform === "web") {
    // Web o Desktop
    return `http://${EXPORT_DEV_IP}:3002`;
  }else if (platform === "electron") {
    // Electron Desktop
    return `http://${EXPORT_DEV_IP}:3002`;
  }
})();

export default { BACKEND_URL };

export { BACKEND_URL };
