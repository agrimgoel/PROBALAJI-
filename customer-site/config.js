/**
 * PROBALAJI AI — Shared API Configuration
 * =========================================
 * This file is the ONLY place you need to edit when changing
 * which machine runs the backend server.
 *
 * HOW TO USE ON A DIFFERENT DEVICE / PHONE:
 *   1. Find your PC's LAN IP (run: python -c "import socket; s=socket.socket(); s.connect(('8.8.8.8',80)); print(s.getsockname()[0])")
 *   2. Replace the IP below with your PC's actual LAN IP.
 *   3. Both phones and other PCs on the same WiFi will work.
 *
 * Auto-detection:
 *   If the page is opened from the same machine (localhost / 127.0.0.1
 *   or file://), it connects to localhost. If opened from another
 *   device over the network, it auto-uses that device's host.
 *
 * Current LAN IP: 192.168.0.104
 */
window.PROBALAJI_CONFIG = (function () {
  const host = window.location.hostname;

  // Opened from file:// or localhost — use localhost backend
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return { API_BASE: "http://localhost:5000" };
  }

  // Opened from a network address (e.g. http://192.168.0.104/...)
  // Use the same host, port 5000
  return { API_BASE: "http://" + host + ":5000" };
})();
