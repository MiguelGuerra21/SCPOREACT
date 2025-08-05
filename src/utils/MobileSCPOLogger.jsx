import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const LOG_FILE = 'SCPOLogs.txt';

export default {
  async log(message) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${message}\n`;

    try {
      // Append to existing file, or create it
      await Filesystem.appendFile({
        path: LOG_FILE,
        data: line,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
    } catch (e) {
      console.error('Failed to write log to device', e);
    }
  }
};
