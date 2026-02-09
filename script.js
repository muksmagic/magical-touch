// =========================
// API BASE (Live Server -> Express on :3000)
// If you open the site via http://localhost:3000 then you can set API_BASE = ""
// =========================
const API_BASE = "http://localhost:3000";

function scrollToBooking() {
  document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
}

// gallery scroller
function scrollGallery(dir) {
  const track = document.getElementById("galleryTrack");
  if (!track) return;
  track.scrollBy({ left: dir * 280, behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // BOOKING
  // =========================
  const dateInput = document.getElementById("date");
  const serviceSelect = document.getElementById("service");
  const timeSelect = document.getElementById("time");
  const errorBox = document.getElementById("bookingError");
  const form = document.getElementById("bookingForm");
  const successBox = document.getElementById("bookingSuccess");

  if (!dateInput || !serviceSelect || !timeSelect) return;

  // Server rules: today -> 30 days ahead
  const today = new Date();
  const min = today.toISOString().split("T")[0];
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 30);
  const max = maxDate.toISOString().split("T")[0];

  dateInput.min = min;
  dateInput.max = max;

  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  function hideError() {
    if (!errorBox) return;
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
  }

  function resetTimes(msg = "Select Time") {
    timeSelect.innerHTML = `<option value="">${msg}</option>`;
  }

  resetTimes();

  async function updateAvailableTimes() {
    hideError();
    resetTimes("Loading...");

    const date = dateInput.value;
    const service = serviceSelect.value;

    if (!service) return resetTimes("Select service first");
    if (!date) return resetTimes("Select date first");

    try {
      const url = `${API_BASE}/api/availability?date=${encodeURIComponent(
        date
      )}&service=${encodeURIComponent(service)}`;

      const res = await fetch(url);

      if (!res.ok) {
        resetTimes("No slots");
        showError(`Availability error (${res.status}). Is the server running on :3000?`);
        return;
      }

      const data = await res.json();
      const slots = Array.isArray(data.availableSlots) ? data.availableSlots : [];

      resetTimes("Select Time");

      if (!slots.length) {
        timeSelect.innerHTML += `<option disabled>No slots available</option>`;
        showError("No slots: try another date (within 30 days) or not Sunday.");
        return;
      }

      slots.forEach((t) => {
        timeSelect.innerHTML += `<option value="${t}">${t}</option>`;
      });
    } catch (err) {
      console.error(err);
      resetTimes("No slots");
      showError("Could not reach the server. Start it: node server.js (port 3000).");
    }
  }

  // 🔥 When service/date changes, reload times
  dateInput.addEventListener("change", updateAvailableTimes);
  serviceSelect.addEventListener("change", updateAvailableTimes);

  // 🔥 If both already filled (browser autofill), load times once
  if (dateInput.value && serviceSelect.value) {
    updateAvailableTimes();
  }

  // =========================
  // SUBMIT BOOKING
  // =========================
  if (form && errorBox && successBox) {
    const submitBtn = form.querySelector("button");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideError();
      successBox.classList.add("hidden");

      const bookingData = {
        name: document.getElementById("name")?.value.trim() || "",
        phone: document.getElementById("phone")?.value.trim() || "",
        service: serviceSelect.value,
        date: dateInput.value,
        time: timeSelect.value,
      };

      if (!bookingData.service || !bookingData.date || !bookingData.time) {
        showError("Please select service, date and time.");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Booking...";
      }

      try {
        const response = await fetch(`${API_BASE}/api/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingData),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          showError(result.message || "Booking failed.");
          // if server gives suggestions, refresh times
          if (result.suggestions?.length) updateAvailableTimes();
          return;
        }

        successBox.classList.remove("hidden");

        // WhatsApp send (this does NOT affect booking)
        const whatsappMessage = encodeURIComponent(
          `Hello Magical Touch ✂️
NEW BOOKING REQUEST (Pending)
Name: ${bookingData.name}
Phone: ${bookingData.phone}
Service: ${bookingData.service}
Date: ${bookingData.date}
Time: ${bookingData.time}`
        );

        setTimeout(() => {
          window.open(`https://wa.me/27750871734?text=${whatsappMessage}`, "_blank");
        }, 900);

        form.reset();
        resetTimes();
      } catch (err) {
        console.error(err);
        showError("Server error. Please try again.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Confirm Booking";
        }
      }
    });
  }

  // =========================
  // NAV (toggle + close outside + escape)
  // =========================
  const navToggle = document.getElementById("navToggle");
  const mainNav = document.getElementById("mainNav");
  if (!navToggle || !mainNav) return;

  const closeMenu = () => {
    mainNav.classList.remove("active");
    navToggle.setAttribute("aria-expanded", "false");
  };

  const toggleMenu = () => {
    mainNav.classList.toggle("active");
    navToggle.setAttribute("aria-expanded", mainNav.classList.contains("active"));
  };

  navToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  mainNav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (e) => {
    if (!mainNav.classList.contains("active")) return;
    if (!navToggle.contains(e.target) && !mainNav.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeMenu();
  });
});
