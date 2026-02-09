// server.js
require("dotenv").config({ path: ".env" });

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * ✅ Postgres pool
 */
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
});

/**
 * ✅ Middleware
 */
app.use(
  cors({
    origin: true, // allow Live Server / different ports
    credentials: false,
  })
);
app.use(express.json({ limit: "10kb" }));

// Serve your front-end files (index.html, style.css, script.js, images/)
app.use(express.static(path.join(__dirname)));

// Rate limit API only
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { success: false, message: "Too many requests. Try again later." },
});
app.use("/api", limiter);

// =======================
// REAL-TIME (SSE)
// =======================
const sseClients = new Set();

function sseSend(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch (_) {}
  }
}

/**
 * =======================
 * BUSINESS RULES
 * =======================
 */
const CLOSED_DAYS = [0]; // Sunday
const MAX_BOOKINGS_PER_DAY = 20;
const MAX_DAYS_AHEAD = 30;

const WORKING_HOURS = [
  "09:00","09:30",
  "10:00","10:30",
  "11:00","11:30",
  "12:00","12:30",
  "14:00","14:30",
  "15:00","15:30",
  "16:00","16:30",
  "17:00","17:30",
  "18:00","18:30",
  "19:00","19:30",
  "20:00","20:30",
];

const SERVICE_DURATIONS = {
  Haircut: 30,
  Fade: 45,
  Beard: 30,
  "Full Package": 60,
};

/**
 * =======================
 * HELPERS
 * =======================
 */
function timeToMinutes(time) {
  const [h, m] = String(time).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function isClosedDay(date) {
  return CLOSED_DAYS.includes(new Date(date).getDay());
}

function isDateWithinAllowedRange(date) {
  // ✅ Compare using midnight dates to avoid timezone issues
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selected = new Date(date);
  selected.setHours(0, 0, 0, 0);

  const diffMs = selected.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= 0 && diffDays <= MAX_DAYS_AHEAD;
}

async function hasReachedDailyLimit(date) {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM bookings WHERE date = $1 AND status != 'cancelled'",
    [date]
  );
  return Number(result.rows[0].count) >= MAX_BOOKINGS_PER_DAY;
}

async function hasRecentBooking(phone) {
  const result = await pool.query(
    `
      SELECT 1
      FROM bookings
      WHERE phone = $1
      AND created_at > NOW() - INTERVAL '5 minutes'
      LIMIT 1
    `,
    [phone]
  );
  return result.rowCount > 0;
}

async function getBookingsForDate(date) {
  const result = await pool.query(
    "SELECT time, service FROM bookings WHERE date = $1 AND status != 'cancelled'",
    [date]
  );
  return result.rows;
}

async function getAvailableSlots(date, service) {
  const bookings = await getBookingsForDate(date);
  const duration = SERVICE_DURATIONS[service];

  if (!duration) return [];

  return WORKING_HOURS.filter((slot) => {
    const start = timeToMinutes(slot);
    const end = start + duration;

    return bookings.every((b) => {
      const bStart = timeToMinutes(b.time);
      const bEnd = bStart + (SERVICE_DURATIONS[b.service] || 0);
      // ✅ no overlap
      return end <= bStart || start >= bEnd;
    });
  });
}

/**
 * =======================
 * ADMIN AUTH
 * =======================
 */
function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ message: "ADMIN_TOKEN not set on server" });
  }
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * =======================
 * ROUTES
 * =======================
 */
app.get("/", (req, res) => {
  res.send("Magical Touch Barbershop API is running 🚀");
});

app.get("/api/db-test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json({ success: true, serverTime: result.rows[0].now });
});

// ✅ Real-time stream (SSE)
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

// ✅ Availability: requires date + service
app.get("/api/availability", async (req, res) => {
  try {
    const { date, service } = req.query;

    if (!date || !service) {
      return res.status(400).json({ message: "Date and service required" });
    }

    if (!SERVICE_DURATIONS[service]) {
      return res.status(400).json({ message: "Invalid service" });
    }

    if (isClosedDay(date)) return res.json({ availableSlots: [] });
    if (!isDateWithinAllowedRange(date)) return res.json({ availableSlots: [] });

    const slots = await getAvailableSlots(date, service);
    res.json({ availableSlots: slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Create booking => default status pending (for approval)
app.post("/api/bookings", async (req, res) => {
  try {
    const { name, phone, service, date, time } = req.body;

    if (!name || !phone || !service || !date || !time) {
      return res.status(400).json({ message: "All fields required" });
    }

    if (!SERVICE_DURATIONS[service]) {
      return res.status(400).json({ message: "Invalid service" });
    }

    if (isClosedDay(date)) {
      return res.status(400).json({ message: "Closed on Sundays" });
    }

    if (!isDateWithinAllowedRange(date)) {
      return res.status(400).json({ message: "Date not allowed" });
    }

    if (await hasReachedDailyLimit(date)) {
      return res.status(409).json({ message: "Day fully booked" });
    }

    if (await hasRecentBooking(phone)) {
      return res.status(429).json({ message: "Please wait before booking again" });
    }

    const availableSlots = await getAvailableSlots(date, service);
    if (!availableSlots.includes(time)) {
      return res.status(409).json({
        message: "Time not available",
        suggestions: availableSlots,
      });
    }

    const result = await pool.query(
      `
        INSERT INTO bookings (name, phone, service, date, time, status)
        VALUES ($1,$2,$3,$4,$5,'pending')
        RETURNING *
      `,
      [name, phone, service, date, time]
    );

    // ✅ respond
    res.status(201).json({ success: true, booking: result.rows[0] });

    // 🔥 broadcast refresh for that date (MUST be inside try, after date exists)
    sseSend({ type: "slots_updated", date });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * =======================
 * ADMIN ROUTES
 * =======================
 */
app.get("/api/admin/ping", requireAdmin, (req, res) => res.json({ ok: true }));

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS count FROM bookings WHERE status='confirmed'"
  );
  res.json({ completedBookings: r.rows[0].count });
});

app.get("/api/admin/schedule", requireAdmin, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: "date required" });

  const r = await pool.query(
    `
      SELECT id, name, phone, service, date, time, status, created_at
      FROM bookings
      WHERE date=$1
      ORDER BY time ASC
    `,
    [date]
  );

  res.json({ bookings: r.rows });
});

app.patch("/api/admin/bookings/:id/confirm", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const r = await pool.query(
    "UPDATE bookings SET status='confirmed' WHERE id=$1 AND status='pending' RETURNING *",
    [id]
  );

  if (r.rowCount === 0) {
    return res.status(404).json({ message: "Booking not found or not pending" });
  }

  res.json({ success: true, booking: r.rows[0] });

  // 🔥 broadcast refresh
  sseSend({ type: "slots_updated", date: r.rows[0].date });
});

app.patch("/api/admin/bookings/:id/cancel", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const r = await pool.query(
    "UPDATE bookings SET status='cancelled' WHERE id=$1 RETURNING *",
    [id]
  );

  if (r.rowCount === 0) return res.status(404).json({ message: "Booking not found" });

  res.json({ success: true, booking: r.rows[0] });

  // 🔥 broadcast refresh
  sseSend({ type: "slots_updated", date: r.rows[0].date });
});

app.get("/api/admin/export/csv", requireAdmin, async (req, res) => {
  const { dateFrom, dateTo } = req.query;

  const params = [];
  let sql = `
    SELECT id, name, phone, service, date, time, status, created_at
    FROM bookings
    WHERE 1=1
  `;

  if (dateFrom) {
    params.push(dateFrom);
    sql += ` AND date >= $${params.length}`;
  }
  if (dateTo) {
    params.push(dateTo);
    sql += ` AND date <= $${params.length}`;
  }

  sql += " ORDER BY date ASC, time ASC";

  const r = await pool.query(sql, params);

  const header = "id,name,phone,service,date,time,status,created_at\n";
  const rows = r.rows
    .map((b) => {
      const safe = (v) => String(v ?? "").replaceAll('"', '""');
      return `"${safe(b.id)}","${safe(b.name)}","${safe(b.phone)}","${safe(
        b.service
      )}","${safe(b.date)}","${safe(String(b.time).slice(0, 5))}","${safe(
        b.status
      )}","${safe(b.created_at)}"`;
    })
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="bookings.csv"`);
  res.send(header + rows + "\n");
});

/**
 * ✅ Start
 */
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
