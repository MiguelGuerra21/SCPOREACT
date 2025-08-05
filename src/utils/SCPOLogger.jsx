// src/utils/SCPOLogger.js
class SCPOLogger {
  static enabled = false;
  

  static async init() {
    try {
      await fetch("/api/ping");
      SCPOLogger.enabled = true;
    } catch {
      SCPOLogger.enabled = false;
    }
  }

  /**
   * @param {{ timestamp: string, user: string, action: string, info: any }} params
   */
  static async log({ timestamp, user, action, info }) {
    if (!SCPOLogger.enabled) return;
    // serialize the info object
    const infoStr = typeof info === "string"
      ? info
      : JSON.stringify(info);
    const line = `[${timestamp}] | ${user} | ${action} | ${infoStr}`;

    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: line })
      });
    } catch (err) {
      SCPOLogger.enabled = false;
      console.warn("SCPOLogger disabled due to error:", err);
    }
  }
}

export default SCPOLogger;
