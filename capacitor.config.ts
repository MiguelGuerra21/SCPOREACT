import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAPACITOR_SERVER_URL || process.env.REACT_APP_CAPACITOR_SERVER_URL || null;

const config: CapacitorConfig = {
  appId: 'com.isastur.scpomobileapp',
  appName: 'SCPOMobileApp',
  webDir: 'build',
  // Sólo añade server si devServerUrl está definida
  ...(devServerUrl ? { server: { url: devServerUrl, cleartext: true } } : {})
};

export default config;