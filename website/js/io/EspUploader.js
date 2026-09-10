/**
 * EspUploader.js
 * Enables direct HTTP pushing of animation JSON from the browser to the ESP32-S3 web server.
 */

export class EspUploader {
  constructor(jsonHandler) {
    this.jsonHandler = jsonHandler;
    this.targetIp = localStorage.getItem('animatrix_esp32_ip') || '192.168.4.1';
    this.uploadEndpoint = '/api/upload';
  }

  setTargetIp(ip) {
    this.targetIp = ip.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    localStorage.setItem('animatrix_esp32_ip', this.targetIp);
  }

  getBaseUrl() {
    return `http://${this.targetIp}`;
  }

  /**
   * Ping the ESP32 to check connectivity
   */
  async ping() {
    const url = `${this.getBaseUrl()}/api/status`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const resp = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        return { success: true, status: resp.status };
      }
      return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
    } catch (err) {
      clearTimeout(timeoutId);
      return { success: false, error: err.name === 'AbortError' ? 'Connection timed out' : err.message };
    }
  }

  /**
   * Push JSON animation payload to ESP32 web server
   */
  async uploadAnimation(options = {}) {
    const jsonPayload = this.jsonHandler.exportToJsonString({ encoding: 'hex_stream', indent: false });
    const url = `${this.getBaseUrl()}${this.uploadEndpoint}`;
    const filename = `${this.jsonHandler.state.name || 'anim'}.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      // Send as POST with JSON body and custom filename header
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Animation-Name': filename
        },
        body: jsonPayload,
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const text = await resp.text();
        return { success: true, message: text || 'Animation loaded on helmet!' };
      } else {
        return { success: false, error: `Server returned HTTP ${resp.status}` };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        success: false,
        error: err.name === 'AbortError' ? 'Upload timed out' : `${err.message} (Ensure CORS is enabled on ESP32)`
      };
    }
  }
}
