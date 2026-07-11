/**
 * PROBALAJI AI — Shared API Configuration (Admin Site)
 * =====================================================
 * Same auto-detection as customer-site/config.js
 * Edit the IP comment below if you need to hard-code a different host.
 *
 * Current LAN IP: 192.168.0.104
 */
window.PROBALAJI_CONFIG = (function () {
  const host = window.location.hostname;

  if (!host || host === "localhost" || host === "127.0.0.1") {
    return { API_BASE: "http://localhost:5000" };
  }

  return { API_BASE: "http://" + host + ":5000" };
})();
