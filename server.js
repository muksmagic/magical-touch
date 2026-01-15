// ===============================
// ENV & IMPORTS
// ===============================
require("dotenv").config({ path: ".env" });

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

// ===============================
// APP SETUP
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// DATABASE CONNECTION
// ===============================
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json({ limit: "10kb" }));

// ===============================
// RATE LIMITING
// ===============================
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api/bookings", bookingLimiter);
app.use("/api/availability", bookingLimiter);

// ===============================
// BUSINESS RULES
// ===============================
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
  "17:00",
];

const SERVICE_DURATIONS = {
  Haircut: 30,
  Fade: 45,
  Beard: 30,
  "Full Package": 60,
};

// ===============================
// HELPERS
// ===============================
function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function isClosedDay(date) {
  return CLOSED_DAYS.includes(new Date(date).getDay());
}

function isDateWithinAllowedRange(date) {
  const today = new Date();
  const selected = new Date(date);
  const diffDays = (selected - today) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= MAX_DAYS_AHEAD;
}

async function hasReachedDailyLimit(date) {
  const result = await pool.query(
    "SELECT COUNT(*) FROM bookings WHERE date = $1",
    [date]
  );
  return Number(result.rows[0].count) >= MAX_BOOKINGS_PER_DAY;
}

async function hasRecentBooking(phone) {
  const result = await pool.query(
    `
    SELECT 1 FROM bookings
    WHERE phone = $1
    AND created_at > NOW() - INTERVAL '5 minutes'
    `,
    [phone]
  );
  return result.rowCount > 0;
}

async function getBookingsForDate(date) {
  const result = await pool.query(
    "SELECT time, service FROM bookings WHERE date = $1",
    [date]
  );
  return result.rows;
}

async function getAvailableSlots(date, service) {
  const bookings = await getBookingsForDate(date);
  const duration = SERVICE_DURATIONS[service];

  return WORKING_HOURS.filter(slot => {
    const start = timeToMinutes(slot);
    const end = start + duration;

    return bookings.every(b => {
      const bStart = timeToMinutes(b.time.slice(0,5));
      const bEnd = bStart + SERVICE_DURATIONS[b.service];
      return end <= bStart || start >= bEnd;
    });
  });
}

// ===============================
// ROUTES
// ===============================

// Health check
app.get("/", (req, res) => {
  res.send("Magical Touch Barbershop API is running 🚀");
});

// DB test
app.get("/api/db-test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json({ success: true, serverTime: result.rows[0].now });
});

// Availability
app.get("/api/availability", async (req, res) => {
  const { date, service } = req.query;

  if (!date || !service) {
    return res.status(400).json({ message: "Date and service required" });
  }

  const slots = await getAvailableSlots(date, service);
  res.json({ availableSlots: slots });
});

// Create booking
app.post("/api/bookings", async (req, res) => {
  try {
    const { name, phone, service, date, time } = req.body;

    if (!name || !phone || !service || !date || !time) {
      return res.status(400).json({ message: "All fields required" });
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
      return res.status(429).json({
        message: "Please wait before booking again",
      });
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
      INSERT INTO bookings (name, phone, service, date, time)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [name, phone, service, date, time]
    );

    res.status(201).json({
      success: true,
      booking: result.rows[0],
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
