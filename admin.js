// admin.js
// =========================
// Admin Dashboard (Ibbie the barber)
// Matches admin.html IDs exactly
// + WhatsApp notify on Confirm/Cancel (opens wa.me with prefilled message)
// =========================

console.log("admin.js loaded");

// IMPORTANT: if you open admin.html with Live Server (127.0.0.1:5500),
// your API is on :3000
const API_BASE = "http://localhost:3000";

const $ = (id) => document.getElementById(id);

let ADMIN_TOKEN = localStorage.getItem("ADMIN_TOKEN") || "";

// -------------------------
// Helpers
// -------------------------
function isoDate(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function setModal(open) {
  const modal = $("loginModal");
  if (!modal) return;
  modal.style.display = open ? "flex" : "none";
}

function setMsg(id, msg = "", ok = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = msg ? (ok ? "#bfffd0" : "#ffb4b4") : "";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-token": ADMIN_TOKEN,
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pill(status) {
  const v = String(status || "").toLowerCase();
  if (v === "confirmed") return `<span class="pill pill--ok">confirmed</span>`;
  if (v === "cancelled") return `<span class="pill pill--bad">cancelled</span>`;
  return `<span class="pill pill--pending">pending</span>`;
}

function digitsOnlyPhone(phone) {
  // Keep only digits; if they start with 0, you may want to convert to country code manually.
  return String(phone || "").replace(/\D/g, "");
}

/**
 * ✅ Open WhatsApp with prefilled message to client
 * - Uses wa.me/<digits>?text=...
 * - If popup blocker blocks it, user may need to allow popups
 */
function notifyClientOnWhatsApp({ phone, name, service, date, time, action }) {
  const to = digitsOnlyPhone(phone);
  if (!to) return;

  const prettyAction = action === "confirm" ? "CONFIRMED ✅" : "CANCELLED ❌";

  const message =
    action === "confirm"
      ? `Hello ${name || "there"} 👋
Your appointment has been ${prettyAction}

Service: ${service}
Date: ${date}
Time: ${time}

See you soon — Ibbie the barber ✂️`
      : `Hello ${name || "there"} 👋
Your appointment has been ${prettyAction}

Reason: Barber is not available for this time slot.
Please choose another time.

Service: ${service}
Date: ${date}
Time: ${time}

— Ibbie the barber ✂️`;

  const url = `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

// -------------------------
// API calls
// -------------------------
async function adminPing() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/ping`, { headers: authHeaders() });
    return res.ok;
  } catch (e) {
    console.error("adminPing error:", e);
    return false;
  }
}

async function loadStats() {
  const completedPill = $("completedPill");
  if (!completedPill) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    completedPill.textContent = `Completed: ${data.completedBookings ?? 0}`;
  } catch (_) {}
}

async function loadSchedule(date) {
  const tbody = $("scheduleRows");
  if (!tbody) return;

  setMsg("scheduleMsg", "");
  tbody.innerHTML = `<tr><td colspan="5" style="padding:14px; opacity:.75;">Loading…</td></tr>`;

  try {
    const res = await fetch(
      `${API_BASE}/api/admin/schedule?date=${encodeURIComponent(date)}`,
      { headers: authHeaders() }
    );

    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding:14px; color:#ffb4b4;">
            ${escapeHtml(msg.message || "Failed to load schedule")}
          </td>
        </tr>
      `;
      return;
    }

    const data = await res.json();
    const bookings = data.bookings || [];

    if (!bookings.length) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="padding:14px; opacity:.75;">No bookings for this day yet.</td></tr>
      `;
      return;
    }

    tbody.innerHTML = bookings
      .map((b) => {
        const time = escapeHtml(String(b.time).slice(0, 5));
        const name = escapeHtml(b.name);
        const phone = escapeHtml(b.phone || "");
        const service = escapeHtml(b.service);
        const statusHtml = pill(b.status);

        const canConfirm = String(b.status).toLowerCase() === "pending";
        const canCancel = String(b.status).toLowerCase() !== "cancelled";

        // We store needed fields for notification on the button dataset
        return `
          <tr>
            <td>${time}</td>
            <td>
              <div class="client">
                <div class="client__name">${name}</div>
                <div class="client__phone">${phone}</div>
              </div>
            </td>
            <td>${service}</td>
            <td>${statusHtml}</td>
            <td class="actions">
              <button class="btn btn--small"
                type="button"
                data-action="confirm"
                data-id="${b.id}"
                data-name="${escapeHtml(b.name)}"
                data-phone="${escapeHtml(b.phone || "")}"
                data-service="${escapeHtml(b.service)}"
                data-date="${escapeHtml(String(b.date).slice(0, 10))}"
                data-time="${escapeHtml(String(b.time).slice(0, 5))}"
                ${canConfirm ? "" : "disabled"}>
                Confirm
              </button>
              <button class="btn btn--small btn--danger"
                type="button"
                data-action="cancel"
                data-id="${b.id}"
                data-name="${escapeHtml(b.name)}"
                data-phone="${escapeHtml(b.phone || "")}"
                data-service="${escapeHtml(b.service)}"
                data-date="${escapeHtml(String(b.date).slice(0, 10))}"
                data-time="${escapeHtml(String(b.time).slice(0, 5))}"
                ${canCancel ? "" : "disabled"}>
                Cancel
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `
      <tr><td colspan="5" style="padding:14px; color:#ffb4b4;">Server error loading schedule.</td></tr>
    `;
  }
}

async function updateBooking(id, action) {
  const endpoint =
    action === "confirm"
      ? `${API_BASE}/api/admin/bookings/${id}/confirm`
      : `${API_BASE}/api/admin/bookings/${id}/cancel`;

  const res = await fetch(endpoint, { method: "PATCH", headers: authHeaders() });

  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    alert(msg.message || "Action failed");
    return false;
  }

  return true;
}

function exportCsv(dateFrom, dateTo) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  window.open(`${API_BASE}/api/admin/export/csv?${params.toString()}`, "_blank");
}

// -------------------------
// Real-time auto refresh (SSE)
// -------------------------
function startRealtime() {
  try {
    const es = new EventSource(`${API_BASE}/api/stream`);
    es.onmessage = async (evt) => {
      const payload = JSON.parse(evt.data || "{}");
      if (payload.type !== "slots_updated") return;

      const currentDate = $("scheduleDate")?.value;
      if (currentDate && payload.date === currentDate) {
        await loadSchedule(currentDate);
        await loadStats();
      }
    };
  } catch (_) {}
}

// -------------------------
// Boot
// -------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Login elements (YOUR IDs)
  const tokenInput = $("token");
  const loginBtn = $("saveToken");
  const logoutBtn = $("logout");

  // Schedule elements (YOUR IDs)
  const scheduleDate = $("scheduleDate");
  const btnToday = $("todayBtn");
  const btnTomorrow = $("tomorrowBtn");
  const btnLoad = $("loadSchedule");

  // Export elements (YOUR IDs)
  const expFrom = $("expFrom");
  const expTo = $("expTo");
  const exportBtn = $("exportCSV");

  // Set default schedule date
  if (scheduleDate && !scheduleDate.value) {
    scheduleDate.value = isoDate(new Date());
  }

  // Try auto-login if token stored
  if (ADMIN_TOKEN) {
    const ok = await adminPing();
    if (ok) {
      setModal(false);
      await loadStats();
      await loadSchedule(scheduleDate.value);
      startRealtime();
    } else {
      localStorage.removeItem("ADMIN_TOKEN");
      ADMIN_TOKEN = "";
      setModal(true);
      setMsg("loginMsg", "Invalid token (stored). Please login again.");
    }
  } else {
    setModal(true);
  }

  // Login
  loginBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    setMsg("loginMsg", "");
    const token = tokenInput?.value?.trim() || "";
    if (!token) return setMsg("loginMsg", "Enter token");

    ADMIN_TOKEN = token;
    localStorage.setItem("ADMIN_TOKEN", token);

    const ok = await adminPing();
    if (!ok) {
      localStorage.removeItem("ADMIN_TOKEN");
      ADMIN_TOKEN = "";
      return setMsg("loginMsg", "Invalid token");
    }

    setMsg("loginMsg", "Logged in ✅", true);
    setModal(false);
    await loadStats();
    await loadSchedule(scheduleDate.value);
    startRealtime();
  });

  // Logout
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("ADMIN_TOKEN");
    ADMIN_TOKEN = "";
    location.reload();
  });

  // Today / Tomorrow / Load
  btnToday?.addEventListener("click", async () => {
    if (!scheduleDate) return;
    scheduleDate.value = isoDate(new Date());
    await loadSchedule(scheduleDate.value);
  });

  btnTomorrow?.addEventListener("click", async () => {
    if (!scheduleDate) return;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    scheduleDate.value = isoDate(d);
    await loadSchedule(scheduleDate.value);
  });

  btnLoad?.addEventListener("click", async () => {
    if (!scheduleDate?.value) return;
    await loadSchedule(scheduleDate.value);
  });

  // Confirm / Cancel (event delegation)
  $("scheduleRows")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!action || !id) return;

    // Grab info for notification BEFORE refresh
    const payload = {
      action,
      name: btn.getAttribute("data-name") || "",
      phone: btn.getAttribute("data-phone") || "",
      service: btn.getAttribute("data-service") || "",
      date: btn.getAttribute("data-date") || $("scheduleDate")?.value || "",
      time: btn.getAttribute("data-time") || "",
    };

    // Optional confirm prompt for cancel
    if (action === "cancel") {
      const yes = confirm("Cancel this booking and notify the client?");
      if (!yes) return;
    }

    btn.disabled = true;

    const ok = await updateBooking(id, action);
    if (ok) {
      // ✅ Notify client (WhatsApp opens with message)
      notifyClientOnWhatsApp(payload);

      const date = $("scheduleDate")?.value;
      if (date) await loadSchedule(date);
      await loadStats();

      setMsg(
        "scheduleMsg",
        action === "confirm"
          ? "Confirmed ✅ — WhatsApp notification opened."
          : "Cancelled ❌ — WhatsApp notification opened.",
        true
      );
      setTimeout(() => setMsg("scheduleMsg", ""), 2500);
    }

    btn.disabled = false;
  });

  // Export
  exportBtn?.addEventListener("click", () => {
    exportCsv(expFrom?.value || "", expTo?.value || "");
    setMsg("exportMsg", "Export started…", true);
    setTimeout(() => setMsg("exportMsg", ""), 2000);
  });
});
