/**
 * PROBALAJI AI — Admin Console JavaScript
 *
 * SECURITY:
 *  - JWT token is stored in a module-level JS variable (memory only).
 *    It is NOT in localStorage or sessionStorage.
 *    It is lost on page refresh — user must log in again.
 *  - Every admin API call sends the token as: Authorization: Bearer <token>
 *  - On any 401 response, the token is cleared and login page is shown.
 *  - NO passwords, NO hardcoded secrets, NO API keys appear in this file.
 */

// API base auto-detected by config.js (localhost for same machine, LAN IP for phones/other devices)
const API_BASE = (window.PROBALAJI_CONFIG && window.PROBALAJI_CONFIG.API_BASE) || "http://localhost:5000";

// ── In-memory token storage ───────────────────────────────────────────────────
// Using a closure to prevent accidental global access
const Auth = (() => {
  let _token = null;
  let _username = null;

  return {
    setToken(token, username) {
      _token = token;
      _username = username;
    },
    getToken()    { return _token; },
    getUsername() { return _username; },
    clear()       { _token = null; _username = null; },
    isLoggedIn()  { return !!_token; }
  };
})();

// ── Cached data ───────────────────────────────────────────────────────────────
let _complaints = [];
let _batteries  = [];

// ── Battery type state ────────────────────────────────────────────────────────
let _selectedBatteryType = null;

// ═════════════════════════════════════════════════════════════════════════════
//  PAGE ROUTING
// ═════════════════════════════════════════════════════════════════════════════

function showLoginPage() {
  document.getElementById("page-login").style.display  = "";
  document.getElementById("page-dashboard").style.display = "none";
}

function showDashboard(username) {
  document.getElementById("page-login").style.display    = "none";
  document.getElementById("page-dashboard").style.display = "";
  document.getElementById("current-username").textContent = username || "admin";

  // Set today's date in the battery form
  const dateInput = document.getElementById("b-date");
  if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];

  loadDashboardData();
  // Auto-refresh every 30 seconds
  clearInterval(window._refreshTimer);
  window._refreshTimer = setInterval(loadDashboardData, 30000);
}

// ── Protected API helper ──────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    // Token expired or invalid — force re-login
    Auth.clear();
    showLoginPage();
    showError("Session expired. Please log in again.");
    throw new Error("Unauthorized");
  }

  return res;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LOGIN
// ═════════════════════════════════════════════════════════════════════════════

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const btn      = document.getElementById("btn-login");
  const errDiv   = document.getElementById("login-error");

  errDiv.style.display = "none";
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-opacity="0.3"/><path d="M21 12a9 9 0 01-9 9"/></svg> Authenticating...`;

  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errDiv.textContent  = data.message || "Invalid credentials.";
      errDiv.style.display = "block";
      document.getElementById("login-password").value = "";
      document.getElementById("login-password").focus();
      return;
    }

    // Store token in memory
    Auth.setToken(data.access_token, data.username);
    showDashboard(data.username);

  } catch (err) {
    errDiv.textContent  = `Could not reach the server. Ensure the backend is running at ${API_BASE}.`;
    errDiv.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg> Authenticate`;
  }
}

function logout() {
  clearInterval(window._refreshTimer);
  Auth.clear();
  showLoginPage();
  document.getElementById("login-form").reset();
}

function togglePasswordVisibility() {
  const input = document.getElementById("login-password");
  input.type  = input.type === "password" ? "text" : "password";
}

function showError(msg) {
  const errDiv = document.getElementById("login-error");
  if (errDiv) { errDiv.textContent = msg; errDiv.style.display = "block"; }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DASHBOARD DATA LOADING
// ═════════════════════════════════════════════════════════════════════════════

async function loadDashboardData() {
  if (!Auth.isLoggedIn()) return;
  await Promise.allSettled([loadBatteries(), loadComplaints()]);
  updateMetrics();
}

async function loadBatteries() {
  try {
    const res  = await apiFetch("/api/admin/batteries");
    const data = await res.json();
    _batteries = Array.isArray(data) ? data : [];
    renderBatteries();
  } catch (err) {
    if (err.message !== "Unauthorized") console.warn("batteries fetch error:", err);
  }
}

async function loadComplaints() {
  try {
    const res  = await apiFetch("/api/admin/complaints");
    const data = await res.json();
    _complaints = Array.isArray(data) ? data : [];
    renderComplaints();
  } catch (err) {
    if (err.message !== "Unauthorized") console.warn("complaints fetch error:", err);
  }
}

function updateMetrics() {
  setText("m-total-complaints", _complaints.length);
  setText("m-pending",   _complaints.filter(c => c.status === "pending").length);
  setText("m-in-progress", _complaints.filter(c => c.status === "in-progress").length);
  setText("m-batteries", _batteries.length);
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB SWITCHING
// ═════════════════════════════════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll(".subnav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
  document.getElementById(`tab-${tab}`).classList.add("active");
  document.getElementById(`panel-${tab}`).style.display = "";
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMPLAINTS TABLE
// ═════════════════════════════════════════════════════════════════════════════

function renderComplaints() {
  const tbody  = document.getElementById("complaints-tbody");
  if (!tbody) return;

  const status = (document.getElementById("filter-status")?.value || "all");
  const search = (document.getElementById("search-complaints")?.value || "").toLowerCase().trim();

  let rows = _complaints.filter(c => {
    const matchStatus = status === "all" || c.status === status;
    const matchSearch = !search ||
      c.name?.toLowerCase().includes(search) ||
      c.serial?.toLowerCase().includes(search) ||
      c.id?.toLowerCase().includes(search) ||
      c.phone?.includes(search);
    return matchStatus && matchSearch;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">📂 No tickets matching current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(c => {
    const pillClass = c.status === "pending" ? "pill-pending" :
                      c.status === "in-progress" ? "pill-progress" : "pill-resolved";
    const date = c.timestamp ? new Date(c.timestamp).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"2-digit" }) : "—";
    return `
      <tr>
        <td><span class="td-mono" style="color:#818cf8;">${c.id}</span></td>
        <td>
          <div class="td-name">${esc(c.name)}</div>
          <div class="td-muted">📞 ${esc(c.phone)}</div>
          <div class="td-muted" style="max-width:200px; white-space:normal;">📍 ${esc(c.address)}</div>
        </td>
        <td>
          <div style="font-weight:500;">${esc(c.product)}</div>
          <div class="td-muted td-mono">SN: ${esc(c.serial)}</div>
          <div style="font-size:0.75rem; color:#9ca3af; margin-top:0.3rem; font-style:italic; max-width:220px; white-space:normal;">"${esc(c.details)}"</div>
        </td>
        <td>
          <select class="status-select" onchange="updateComplaintStatus('${c.id}', this.value)">
            <option value="pending"     ${c.status==="pending"?"selected":""}>Pending</option>
            <option value="in-progress" ${c.status==="in-progress"?"selected":""}>In Progress</option>
            <option value="resolved"    ${c.status==="resolved"?"selected":""}>Resolved</option>
          </select>
        </td>
        <td style="white-space:nowrap; font-size:0.78rem; color:var(--text-muted);">${date}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon danger" onclick="deleteComplaintConfirm('${c.id}')" title="Delete ticket">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

async function updateComplaintStatus(id, newStatus) {
  try {
    const res = await apiFetch(`/api/admin/complaints/${id}`, {
      method: "PATCH",
      body:   JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Failed");
    const idx = _complaints.findIndex(c => c.id === id);
    if (idx >= 0) _complaints[idx].status = newStatus;
    updateMetrics();
    showToast(`Ticket ${id} updated to "${newStatus}"`);
  } catch {
    showToast("⚠️ Failed to update status. Please try again.");
    await loadComplaints();
  }
}

function deleteComplaintConfirm(id) {
  showConfirm(
    "Delete Ticket",
    `Are you sure you want to permanently delete ticket ${id}? This cannot be undone.`,
    async () => {
      try {
        const res = await apiFetch(`/api/admin/complaints/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed");
        _complaints = _complaints.filter(c => c.id !== id);
        renderComplaints();
        updateMetrics();
        showToast(`Ticket ${id} deleted.`);
      } catch {
        showToast("⚠️ Failed to delete ticket.");
      }
    }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  BATTERIES TABLE
// ═════════════════════════════════════════════════════════════════════════════

function renderBatteries() {
  const tbody = document.getElementById("batteries-tbody");
  if (!tbody) return;

  const search = (document.getElementById("search-batteries")?.value || "").toLowerCase().trim();

  let rows = _batteries.filter(b =>
    !search ||
    b.name?.toLowerCase().includes(search) ||
    b.serial?.toLowerCase().includes(search) ||
    b.phone?.includes(search)
  );

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">📦 No battery registrations found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(b => {
    const analysis = calcWarranty(b.date, b.duration);
    const cardHtml = b.card_given === "Yes"
      ? `<span class="card-locked-badge">📜 Handed Over</span>`
      : `<button class="btn-card-give" onclick="markCardGivenConfirm('${esc(b.serial)}')">⬜ Mark Given</button>`;
    const pillClass = analysis.isUnderWarranty ? "pill-warranty" : "pill-expired";
    const date = b.date ? new Date(b.date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "—";

    return `
      <tr>
        <td>
          <div class="td-name">${esc(b.name)}</div>
          <div class="td-muted" style="max-width:160px; white-space:normal;">📍 ${esc(b.address)}</div>
        </td>
        <td class="td-mono" style="font-size:0.82rem;">${esc(b.phone)}</td>
        <td>
          <div>${esc(b.brand)} ${esc(b.product)}</div>
        </td>
        <td class="td-mono" style="font-size:0.8rem;">${esc(b.serial)}</td>
        <td style="white-space:nowrap; font-size:0.82rem;">${date}</td>
        <td style="white-space:nowrap; font-size:0.82rem;">${b.duration} Mo.</td>
        <td>
          <span class="pill ${pillClass}">${analysis.statusText}</span>
          <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.2rem; white-space:nowrap;">
            ${analysis.remainingDays} days left
          </div>
        </td>
        <td>${cardHtml}</td>
      </tr>`;
  }).join("");
}

function markCardGivenConfirm(serial) {
  showConfirm(
    "Lock Warranty Card Status",
    `Confirm that the physical warranty card was handed over to the customer for Serial: ${serial}.\n\nThis action is PERMANENT and cannot be undone.`,
    async () => {
      try {
        const res = await apiFetch(`/api/admin/batteries/${serial}/card-given`, { method: "POST" });
        if (!res.ok) {
          const d = await res.json();
          showToast(`⚠️ ${d.message || "Failed"}`);
          return;
        }
        const idx = _batteries.findIndex(b => b.serial.toUpperCase() === serial.toUpperCase());
        if (idx >= 0) _batteries[idx].card_given = "Yes";
        renderBatteries();
        showToast("📜 Warranty card locked permanently.");
      } catch {
        showToast("⚠️ Failed to update card status.");
      }
    }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  BATTERY REGISTRATION FORM
// ═════════════════════════════════════════════════════════════════════════════

function selectBatteryType(type) {
  _selectedBatteryType = type;
  document.getElementById("btn-lithium").className    = "type-btn" + (type === "lithium" ? " active" : "");
  document.getElementById("btn-nonlithium").className = "type-btn" + (type === "nonlithium" ? " active" : "");
  const label = document.getElementById("b-power-label");
  const power = document.getElementById("b-power");
  if (label) label.textContent = type === "lithium" ? "Battery Power (e.g. 48V-100Ah)" : "Battery Power (e.g. 150Ah, 220Ah)";
  if (power) power.placeholder = type === "lithium" ? "e.g. 48V-100Ah" : "e.g. 150Ah, 220Ah";
  composeBatteryProduct();
}

function composeBatteryProduct() {
  const brand  = (document.getElementById("b-brand")?.value || "").trim();
  const power  = (document.getElementById("b-power")?.value || "").trim();
  const hidden = document.getElementById("b-product");
  if (!hidden) return;

  if (_selectedBatteryType && power) {
    const typeLabel = _selectedBatteryType === "lithium" ? "Lithium" : "Non-Lithium";
    hidden.value = brand ? `${brand} ${typeLabel} ${power}` : `${typeLabel} ${power}`;
  } else {
    hidden.value = "";
  }
}

async function submitBattery(event) {
  event.preventDefault();

  const serial  = (document.getElementById("b-serial")?.value || "").trim().toUpperCase();
  const product = (document.getElementById("b-product")?.value || "").trim();

  if (!product || !_selectedBatteryType) {
    alert("Please select a battery type (Lithium / Non-Lithium) and enter the battery power.");
    return;
  }

  const btn = document.getElementById("btn-save-battery");
  btn.disabled = true;
  btn.textContent = "Saving...";

  const payload = {
    serial,
    name:       (document.getElementById("b-name")?.value || "").trim(),
    phone:      (document.getElementById("b-phone")?.value || "").trim(),
    address:    (document.getElementById("b-address")?.value || "").trim(),
    product,
    brand:      (document.getElementById("b-brand")?.value || "").trim() || (_selectedBatteryType === "lithium" ? "Lithium" : "Non-Lithium"),
    date:       document.getElementById("b-date")?.value || "",
    duration:   parseInt(document.getElementById("b-duration")?.value || "24"),
    card_given: document.getElementById("b-card-given")?.checked ? "Yes" : "No"
  };

  try {
    const res = await apiFetch("/api/admin/batteries", {
      method: "POST",
      body:   JSON.stringify(payload)
    });

    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.message || "Save failed");
    }

    document.getElementById("battery-success-overlay").style.display = "flex";
    await loadBatteries();
    updateMetrics();

  } catch (err) {
    alert(`Failed to save battery: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Activate Warranty";
  }
}

function resetBatteryForm() {
  document.getElementById("battery-form").reset();
  document.getElementById("battery-success-overlay").style.display = "none";
  _selectedBatteryType = null;
  document.getElementById("btn-lithium").className    = "type-btn";
  document.getElementById("btn-nonlithium").className = "type-btn";
  document.getElementById("b-product").value = "";
  document.getElementById("b-date").value = new Date().toISOString().split("T")[0];
}

// ═════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

function calcWarranty(dateStr, months) {
  const purchase   = new Date(dateStr || Date.now());
  const duration   = parseInt(months, 10) || 24;
  const expiry     = new Date(purchase);
  expiry.setMonth(expiry.getMonth() + duration);
  const now        = new Date();
  const remaining  = Math.max(0, Math.ceil((expiry - now) / 86400000));
  const total      = Math.ceil((expiry - purchase) / 86400000);
  const isActive   = expiry > now;
  return {
    isUnderWarranty: isActive,
    remainingDays:   remaining,
    remainingPercent: isActive ? Math.floor((remaining / total) * 100) : 0,
    statusText: isActive ? "Active" : "Expired"
  };
}

function esc(str) {
  // Basic XSS protection for text inserted into innerHTML
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
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
  }, 5000);
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function showConfirm(title, message, onConfirm) {
  document.getElementById("modal-title").textContent   = title;
  document.getElementById("modal-message").textContent = message;
  document.getElementById("confirm-modal").style.display = "flex";

  const btn = document.getElementById("modal-confirm");
  // Clone to remove old listeners
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener("click", () => {
    closeModal();
    onConfirm();
  });
}

function closeModal() {
  document.getElementById("confirm-modal").style.display = "none";
}

// ═════════════════════════════════════════════════════════════════════════════
//  CSV EXPORT
// ═════════════════════════════════════════════════════════════════════════════

function exportBatteriesToCSV() {
  if (!_batteries || !_batteries.length) {
    showToast("⚠️ No battery registry records found to export.");
    return;
  }

  const headers = ["Serial Number", "Customer Name", "Phone", "Service Address", "Product Model", "Brand Name", "Purchase Date", "Warranty Duration (Months)", "Card Given", "Created At"];
  const rows = [headers.join(",")];

  for (const b of _batteries) {
    const r = [
      escCsv(b.serial),
      escCsv(b.name),
      escCsv(b.phone),
      escCsv(b.address),
      escCsv(b.product),
      escCsv(b.brand),
      escCsv(b.date),
      b.duration || 24,
      escCsv(b.card_given || "No"),
      escCsv(b.created_at)
    ];
    rows.push(r.join(","));
  }

  downloadCsv(rows.join("\n"), "sbib_promax_batteries.csv");
}

function exportComplaintsToCSV() {
  if (!_complaints || !_complaints.length) {
    showToast("⚠️ No service tickets found to export.");
    return;
  }

  const headers = ["Ticket ID", "Customer Name", "Phone", "Address", "Product Model", "Serial Number", "Problem Details", "Status", "Registered Time"];
  const rows = [headers.join(",")];

  for (const c of _complaints) {
    const r = [
      escCsv(c.id),
      escCsv(c.name),
      escCsv(c.phone),
      escCsv(c.address),
      escCsv(c.product),
      escCsv(c.serial),
      escCsv(c.details),
      escCsv(c.status),
      escCsv(c.timestamp)
    ];
    rows.push(r.join(","));
  }

  downloadCsv(rows.join("\n"), "sbib_service_tickets.csv");
}

function escCsv(val) {
  if (val === undefined || val === null) return '""';
  let str = String(val).trim();
  // Double quotes inside string need to be doubled, and wrap the whole thing in double quotes
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

function downloadCsv(content, filename) {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" }); // include BOM for Excel compatibility
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ═════════════════════════════════════════════════════════════════════════════
//  INIT
// ═════════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // Always start at login page
  showLoginPage();

  // Close modal on overlay click
  document.getElementById("confirm-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
});
