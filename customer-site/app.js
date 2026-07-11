/**
 * PROBALAJI AI — Customer Site JavaScript
 *
 * SECURITY: This file contains NO admin logic, NO passwords, NO API keys.
 * It only calls:
 *   POST /api/check-serial   — warranty lookup (public)
 *   POST /api/complaints     — submit complaint (public)
 *
 * All admin operations live exclusively in admin-site/app.js
 */

// ── API Configuration ────────────────────────────────────────────────────────
// API base auto-detected by config.js (localhost for same-machine, LAN IP for phones/other devices)
const API_BASE = (window.PROBALAJI_CONFIG && window.PROBALAJI_CONFIG.API_BASE) || "http://localhost:5000";

// Admin WhatsApp for complaint notifications (sent via wa.me link only, not stored)
const ADMIN_WHATSAPP = "9045651385";

// ── API Status Check ─────────────────────────────────────────────────────────
async function checkApiHealth() {
  const dot   = document.getElementById("api-status-dot");
  const label = document.getElementById("api-status-label");
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      if (dot)   { dot.className = "status-dot online"; }
      if (label) { label.textContent = "System Live"; }
    } else {
      throw new Error("non-ok");
    }
  } catch {
    if (dot)   { dot.className = "status-dot offline"; }
    if (label) { label.textContent = "Server Offline"; }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  checkApiHealth();
  // Re-check every 60 seconds
  setInterval(checkApiHealth, 60000);
});

// ── Warranty Lookup ──────────────────────────────────────────────────────────
async function lookupWarranty() {
  const input     = document.getElementById("lookup-serial");
  const resultDiv = document.getElementById("warranty-result");
  const btn       = document.getElementById("btn-check-warranty");
  const serial    = (input.value || "").trim().toUpperCase();

  if (!serial) {
    alert("Please enter a battery serial number.");
    return;
  }

  // Loading state
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-opacity="0.25"/><path d="M21 12a9 9 0 01-9 9"/></svg> Checking...`;

  try {
    const res = await fetch(`${API_BASE}/api/check-serial`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ serial })
    });

    const data = await res.json();

    if (res.status === 404 || data.status === "not_found") {
      resultDiv.style.display = "block";
      resultDiv.innerHTML = `
        <div style="text-align:center; padding:1rem 0;">
          <div style="font-size:2rem; margin-bottom:0.5rem;">🔍</div>
          <h4 style="color:var(--color-danger); margin-bottom:0.35rem;">No Record Found</h4>
          <p style="color:var(--text-muted); font-size:0.85rem;">
            No warranty found for serial <strong>${serial}</strong>. Please verify your serial number.
          </p>
        </div>`;
      return;
    }

    if (!res.ok) {
      throw new Error(data.message || "Server error");
    }

    // Render warranty card
    resultDiv.style.display = "block";
    resultDiv.innerHTML = buildWarrantyCard(data.battery);

  } catch (err) {
    resultDiv.style.display = "block";
    resultDiv.innerHTML = `
      <div style="text-align:center; padding:1rem 0; color:var(--color-danger);">
        ⚠️ Could not reach the server. Please ensure the backend is running.<br>
        <small style="color:var(--text-muted);">${err.message}</small>
      </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="m21 21-4.35-4.35"/></svg> Check Status`;
  }
}

function buildWarrantyCard(battery) {
  const analysis = calculateWarrantyStatus(battery.date, battery.duration);

  const bannerHtml = analysis.isUnderWarranty
    ? `<div class="warranty-banner-active">🟢 ACTIVE WARRANTY COVERAGE</div>`
    : `<div class="warranty-banner-expired">🔴 WARRANTY PERIOD FINISHED</div>`;

  const colorClass = analysis.remainingPercent > 50 ? "" :
                     analysis.remainingPercent > 20 ? "warning" : "danger";

  return `
    ${bannerHtml}
    <div class="battery-visualizer">
      <div class="battery-viz-labels">
        <span>Warranty Lifespan</span>
        <span>${analysis.remainingPercent}% Coverage Left</span>
      </div>
      <div class="battery-row">
        <div class="battery-body-outline">
          <div class="battery-liquid-fill ${colorClass}" style="width:${analysis.remainingPercent}%;">
            <div class="battery-fill-text">${analysis.remainingDays} Days Left</div>
          </div>
        </div>
        <div class="battery-terminal-node"></div>
      </div>
    </div>
    <div class="warranty-detail-grid">
      <div class="detail-item">
        <div class="detail-label">Registered Owner</div>
        <div class="detail-val">${battery.name || '—'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Product</div>
        <div class="detail-val">${battery.brand || ''} ${battery.product || '—'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Purchased On</div>
        <div class="detail-val">${analysis.purchaseDateFormatted}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Coverage Period</div>
        <div class="detail-val">${battery.duration} Months</div>
      </div>
      <div class="detail-item" style="grid-column:span 2;">
        <div class="detail-label">Expiration Date</div>
        <div class="detail-val" style="color:${analysis.isUnderWarranty ? 'var(--color-success)' : 'var(--color-danger)'};">
          ${analysis.expirationDateFormatted}
        </div>
      </div>
    </div>`;
}

// ── Warranty Status Calculator ────────────────────────────────────────────────
function calculateWarrantyStatus(purchaseDateStr, durationMonths) {
  const purchaseDate   = new Date(purchaseDateStr);
  const duration       = parseInt(durationMonths, 10) || 24;
  const expirationDate = new Date(purchaseDate);
  expirationDate.setMonth(purchaseDate.getMonth() + duration);

  const now          = new Date();
  const totalDays    = Math.ceil((expirationDate - purchaseDate) / 86400000);
  const remainingMs  = expirationDate - now;
  const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
  const isUnderWarranty = remainingMs > 0;
  const remainingPercent = isUnderWarranty
    ? Math.max(0, Math.min(100, Math.floor((remainingDays / totalDays) * 100)))
    : 0;

  const fmt = d => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return {
    isUnderWarranty,
    purchaseDateFormatted:   fmt(purchaseDate),
    expirationDateFormatted: fmt(expirationDate),
    totalDays,
    remainingDays,
    remainingPercent,
    statusText: isUnderWarranty ? "Under Warranty" : "Warranty Expired"
  };
}

// ── Allow Enter key on serial input ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const serialInput = document.getElementById("lookup-serial");
  if (serialInput) {
    serialInput.addEventListener("keypress", e => {
      if (e.key === "Enter") lookupWarranty();
    });
  }
});

// ── Complaint Registration ────────────────────────────────────────────────────
async function registerComplaint(event) {
  event.preventDefault();

  const name    = document.getElementById("comp-name").value.trim();
  const phone   = document.getElementById("comp-phone").value.trim();
  const address = document.getElementById("comp-address").value.trim();
  const product = document.getElementById("comp-product").value;
  const serial  = document.getElementById("comp-serial").value.trim();
  const details = document.getElementById("comp-desc").value.trim();

  const btn = document.getElementById("btn-submit-complaint");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  try {
    const res = await fetch(`${API_BASE}/api/complaints`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, phone, address, product, serial, details })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to submit complaint.");
    }

    // Show success overlay
    const now          = new Date();
    const callbackTime = new Date(now.getTime() + 3600000);
    const fmtTime      = d => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const fmtDate      = d => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    document.getElementById("complaint-success-message").innerHTML =
      `Your complaint has been registered successfully!<br>
       <strong>Ticket ID: ${data.ticket_id}</strong><br>
       Our representative will call you within 1 hour.`;

    document.getElementById("complaint-time-details").innerHTML =
      `Registered On: <strong>${fmtTime(now)} (${fmtDate(now)})</strong><br>
       Assured Call Before: <strong style="color:#ff3333">${fmtTime(callbackTime)}</strong>`;

    document.getElementById("complaint-success").style.display = "flex";

    // Open WhatsApp alert for admin
    const waMsg = buildWhatsAppMsg({ id: data.ticket_id, name, phone, address, product, serial, details });
    setTimeout(() => window.open(waMsg, "_blank"), 1200);

  } catch (err) {
    alert(`Could not submit complaint: ${err.message}\nPlease ensure the backend server is running.`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Complaint Ticket";
  }
}

function resetComplaintForm() {
  document.getElementById("complaint-form").reset();
  document.getElementById("complaint-success").style.display = "none";
}

function buildWhatsAppMsg(c) {
  const text =
    `*PROBALAJI AI — SERVICE REQUEST*\n` +
    `─────────────────────────────\n` +
    `*Ticket ID:* ${c.id}\n` +
    `*Customer:* ${c.name}\n` +
    `*Phone:* ${c.phone}\n` +
    `*Address:* ${c.address}\n` +
    `*Product:* ${c.product}\n` +
    `*Serial:* ${c.serial}\n` +
    `*Issue:* "${c.details}"\n` +
    `─────────────────────────────\n` +
    `Please dispatch an engineer or call the client.`;
  return `https://wa.me/91${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

// ── Toast Notification ────────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.getElementById("live-toast");
  const msg   = document.getElementById("toast-message");
  if (!toast || !msg) return;
  msg.textContent = message;
  toast.style.display = "flex";
  setTimeout(() => toast.classList.add("visible"), 50);
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => { toast.style.display = "none"; }, 300);
  }, 6000);
}

// ── AI Chat Bot ───────────────────────────────────────────────────────────────
function sendQuickTag(categoryKey) {
  const input = document.getElementById("chat-input");
  if (categoryKey && BATTERY_KNOWLEDGE[categoryKey]) {
    input.value = `How to fix ${BATTERY_KNOWLEDGE[categoryKey].title.toLowerCase()}?`;
    submitChatMessage(categoryKey);
  }
}

function submitChatMessage(forcedKey = null) {
  const input   = document.getElementById("chat-input");
  const chatBox = document.getElementById("chat-box");
  const query   = input.value.trim();
  if (!query) return;

  appendBubble(query, "user");
  input.value = "";

  // Keyword matching
  let key = forcedKey;
  if (!key) {
    const q = query.toLowerCase();
    if (q.includes("overload") || q.includes("red light"))           key = "overload";
    else if (q.includes("charging") || q.includes("not charge"))     key = "charging";
    else if (q.includes("backup") || q.includes("drain"))            key = "backup";
    else if (q.includes("dead") || q.includes("no power"))           key = "dead";
    else if (q.includes("beep") || q.includes("alarm"))              key = "beep";
    else if (q.includes("acid") || q.includes("swell") || q.includes("bulge")) key = "acid";
  }

  // Thinking indicator
  const thinkId = "think-" + Date.now();
  const thinkEl = document.createElement("div");
  thinkEl.className = "message agent";
  thinkEl.id = thinkId;
  thinkEl.innerHTML = "<em>PROBALAJI AI is analysing your query...</em>";
  chatBox.appendChild(thinkEl);
  chatBox.scrollTop = chatBox.scrollHeight;

  setTimeout(() => {
    document.getElementById(thinkId)?.remove();

    let html = "";
    if (key && BATTERY_KNOWLEDGE[key]) {
      const info = BATTERY_KNOWLEDGE[key];
      html = `
        <strong>AI Result: ${info.title}</strong><br><br>
        <strong>Symptoms:</strong>
        <ul style="padding-left:1.2rem; margin:0.3rem 0 0.75rem;">
          ${info.symptoms.map(s => `<li>${s}</li>`).join("")}
        </ul>
        <div class="solution-box">
          <h4>🛠️ Step-by-Step Solutions:</h4>
          <ul>${info.solutions.map(s => `<li>${s}</li>`).join("")}</ul>
        </div>
        <div class="safety-box"><strong>⚠️ Safety:</strong> ${info.safety}</div>
        <br>If the issue persists, please register a service complaint below.
      `;
    } else {
      html = `I couldn't isolate a specific fault from your query. Please try one of the quick diagnostic buttons, or describe your symptoms more specifically (e.g. "beeping continuously", "won't charge", "swollen battery").`;
    }

    appendBubble(html, "agent");
  }, 1000);
}

function appendBubble(html, sender) {
  const chatBox = document.getElementById("chat-box");
  const el = document.createElement("div");
  el.className = `message ${sender}`;
  el.innerHTML = html;
  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;
}
