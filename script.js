document.addEventListener("DOMContentLoaded", () => {

  /* =======================
     SCROLL TO BOOKING
  ======================= */
  function scrollToBooking() {
    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
  }

  /* =======================
     DATE – DISABLE PAST
  ======================= */
  const dateInput = document.getElementById("date");
  if (dateInput) {
    dateInput.min = new Date().toISOString().split("T")[0];
  }

  /* =======================
     TIME SELECT
  ======================= */
  const timeSelect = document.getElementById("time");

  function resetTimeSelect() {
    timeSelect.innerHTML = `<option value="">Select Time</option>`;
  }

  resetTimeSelect();

  /* =======================
     FETCH AVAILABLE TIMES
  ======================= */
  async function updateAvailableTimes(date) {
    resetTimeSelect();
    if (!date) return;

    try {
      const response = await fetch(
        `http://localhost:3000/api/availability?date=${date}`
      );

      const data = await response.json();

      if (!data.availableSlots || data.availableSlots.length === 0) {
        timeSelect.innerHTML += `<option disabled>No slots available</option>`;
        return;
      }

      data.availableSlots.forEach(time => {
        timeSelect.innerHTML += `<option value="${time}">${time}</option>`;
      });

    } catch (error) {
      console.error(error);
      timeSelect.innerHTML += `<option disabled>Error loading times</option>`;
    }
  }

  dateInput.addEventListener("change", () => {
    updateAvailableTimes(dateInput.value);
  });

  /* =======================
     IMAGE SKELETON LOADER
  ======================= */
document.querySelectorAll(".image-wrapper img").forEach(img => {
  const wrapper = img.parentElement;

  // Safety timeout (2.5s max skeleton)
  const timeout = setTimeout(() => {
    wrapper.classList.add("loaded");
    img.style.display = "block";
    img.style.opacity = "1";
  }, 2500);

  img.addEventListener("load", () => {
    clearTimeout(timeout);

    setTimeout(() => {
      img.style.display = "block";
      img.style.opacity = "1";
      wrapper.classList.add("loaded");
    }, 300); // small delay = smoother UX
  });

  img.addEventListener("error", () => {
    clearTimeout(timeout);
    wrapper.classList.add("loaded"); // remove skeleton even if image fails
  });
});


  /* =======================
     SERVICE CARD CLICK
  ======================= */
  document.querySelectorAll(".preview-card").forEach(card => {
    card.addEventListener("click", () => {
      const service = card.dataset.service;
      const select = document.getElementById("service");

      select.value = service;
      select.classList.add("highlight");
      setTimeout(() => select.classList.remove("highlight"), 1200);

      scrollToBooking();
    });
  });

  /* =======================
     FORM SUBMIT
  ======================= */
  const form = document.getElementById("bookingForm");
  const submitBtn = form.querySelector("button");
  const successBox = document.getElementById("bookingSuccess");
  const errorBox = document.getElementById("bookingError");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset UI
    errorBox.classList.add("hidden");
    successBox.classList.add("hidden");

    const bookingData = {
      name: document.getElementById("name").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      service: document.getElementById("service").value,
      date: document.getElementById("date").value,
      time: document.getElementById("time").value,
    };

    if (!bookingData.date || !bookingData.time) {
      errorBox.textContent = "Please select a valid date and time.";
      errorBox.classList.remove("hidden");
      return;
    }

    /* 🔒 DISABLE BUTTON (HERE IS THE ANSWER) */
    submitBtn.disabled = true;
    submitBtn.textContent = "Booking...";

    try {
      const response = await fetch("http://localhost:3000/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData),
      });

      const result = await response.json();

      /* ❌ ERROR FROM SERVER */
      if (!response.ok) {
        errorBox.innerHTML = `<strong>${result.message}</strong>`;
        errorBox.classList.remove("hidden");

        // Suggestions UI
        if (result.suggestions) {
          errorBox.innerHTML += `
            <div class="time-suggestions">
              ${result.suggestions.map(t => `<button>${t}</button>`).join("")}
            </div>
          `;

          document.querySelectorAll(".time-suggestions button").forEach(btn => {
            btn.addEventListener("click", () => {
              timeSelect.value = btn.textContent;
              errorBox.classList.add("hidden");
            });
          });
        }

        return;
      }

      /* ✅ SUCCESS */
      successBox.classList.remove("hidden");

      const whatsappMessage = encodeURIComponent(
        `Hello Magical Touch ✂️
Name: ${bookingData.name}
Phone: ${bookingData.phone}
Service: ${bookingData.service}
Date: ${bookingData.date}
Time: ${bookingData.time}`
      );

      setTimeout(() => {
        window.open(
          `https://wa.me/27750871734?text=${whatsappMessage}`,
          "_blank"
        );
      }, 1200);

      form.reset();
      resetTimeSelect();

    } catch (error) {
      console.error(error);
      errorBox.textContent = "Server error. Please try again.";
      errorBox.classList.remove("hidden");
    } finally {
      /* 🔓 RE-ENABLE BUTTON (ALWAYS) */
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirm Booking";
    }
  });

});
