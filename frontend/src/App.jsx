import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import dayjs from "dayjs";
import "./App.css";
import { Routes, Route, Link } from "react-router-dom";
import Admin from "./Admin.jsx";
import BookingSuccess from "./BookingSuccess.jsx";
import BookingCancelled from "./BookingCancelled.jsx";

function HomePage() {
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [closedDates, setClosedDates] = useState([]);
  const [message, setMessage] = useState("");
  const [serviceCategory, setServiceCategory] = useState("MENS");

  useEffect(() => {
    axios.get("/api/services").then((r) => setServices(r.data));
  }, []);

  useEffect(() => {
    axios
      .get("/api/closed-days")
      .then((r) => setClosedDates(r.data.map((item) => item.day)))
      .catch(() => setClosedDates([]));
  }, []);

  const {
  register,
  watch,
  handleSubmit,
  formState: { errors },
} = useForm({
  
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      serviceId: "",
      date: dayjs().format("YYYY-MM-DD"),
      time: "",
      notes: "",
    },
  });

  const selectedServiceId = watch("serviceId");
  const selectedDate = watch("date");

  const filteredServices = useMemo(() => {
    return services.filter((s) => s.category === serviceCategory);
  }, [services, serviceCategory]);

  const selectedService = useMemo(
    () => services.find((s) => String(s.id) === String(selectedServiceId)),
    [services, selectedServiceId]
  );

  useEffect(() => {
    if (!selectedDate) return;

    const from = dayjs(selectedDate).startOf("day").toISOString();
    const to = dayjs(selectedDate).endOf("day").toISOString();

    axios
      .get("/api/appointments", { params: { from, to } })
      .then((r) => setAppointments(r.data))
      .catch(() => setAppointments([]));
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedDate || !selectedService || closedDates.includes(selectedDate)) {
      setAvailableTimes([]);
      return;
    }

    const dayStart = dayjs(`${selectedDate}T09:00`);
    const dayEnd = dayjs(`${selectedDate}T18:00`);

    const slots = [];
    let currentSlot = dayStart;

    while (currentSlot.isBefore(dayEnd)) {
      const slotStart = currentSlot;
      const slotEnd = currentSlot.add(selectedService.durationMin, "minute");

      if (slotEnd.isAfter(dayEnd)) break;

      const overlaps = appointments.some((appt) => {
        const apptStart = dayjs(appt.startTs);
        const apptEnd = dayjs(appt.endTs);

        return slotStart.isBefore(apptEnd) && slotEnd.isAfter(apptStart);
      });

      if (!overlaps) {
        slots.push(slotStart.format("HH:mm"));
      }

      currentSlot = currentSlot.add(30, "minute");
    }

    setAvailableTimes(slots);
  }, [selectedDate, selectedService, appointments, closedDates]);

  const onSubmit = async (data) => {
    setMessage("");

    const startTs = dayjs(`${data.date}T${data.time}`).toISOString();

    if (closedDates.includes(data.date)) {
      setMessage("Sorry, we are closed on this date.");
      return;
    }

    if (!availableTimes.includes(data.time)) {
      setMessage("Sorry, that time is no longer available.");
      return;
    }

    try {
      const response = await axios.post("/api/create-checkout-session", {
        customer: {
          name: data.name,
          email: data.email,
          phone: data.phone,
        },
        staffId: 1,
        serviceId: Number(data.serviceId),
        startTs,
        notes: data.notes || undefined,
      });

      if (response.data?.url) {
        window.location.href = response.data.url;
        return;
      }

      setMessage("Unable to start payment.");
    } catch (e) {
      setMessage(e.response?.data?.error || "Failed to start payment");
    }
  };

  return (
    <>
      {/* Hero */}
      <div className="hero">
        <img src="/logo-eb.png" alt="EB StyledIt logo" className="hero-logo" />

        <div>
          <div className="hero-title">EB StyledIt</div>
          <div className="hero-sub">
            Luxury Hair Atelier • @eb.styleditt
          </div>
        </div>
      </div>

      {/* Price List */}
      <section className="panel" style={{ marginBottom: 22 }}>
        <h2 className="section-title">Price List</h2>

        <div className="price-grid">
          <figure className="price-card">
            <img src="/price-men.png" alt="Men's price list" />
            <figcaption className="caption">Mens</figcaption>
          </figure>

          <figure className="price-card">
            <img src="/price-women.png" alt="Women's price list" />
            <figcaption className="caption">Womens</figcaption>
          </figure>
        </div>
      </section>

      {/* Booking */}
      <section className="panel" id="book">
        <h2 className="section-title">Book Now</h2>

        {/* Category Tabs */}
        <div className="service-tabs">
          <button
            type="button"
            className={`service-tab ${
              serviceCategory === "MENS" ? "active" : ""
            }`}
            onClick={() => setServiceCategory("MENS")}
          >
            Mens
          </button>

          <button
            type="button"
            className={`service-tab ${
              serviceCategory === "WOMENS" ? "active" : ""
            }`}
            onClick={() => setServiceCategory("WOMENS")}
          >
            Womens
          </button>
        </div>

        {selectedServiceId && selectedService && (
          <p className="helper">
            Booking: <strong>{selectedService.name}</strong>
          </p>
        )}

        <form className="form" onSubmit={handleSubmit(onSubmit)}>
          {/* Name */}
          <div className="row">
            <input
              placeholder="Your name"
              {...register("name", {
                required: "Name is required",
              })}
            />
          </div>

          {/* Email + Phone */}
          <div className="row">
            <div style={{ flex: 1 }}>
              <input
                placeholder="Email"
                {...register("email", {
                  required: "Email is required",
                })}
              />

              {errors.email && (
                <p className="helper" style={{ color: "#ffb3b3" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <input
                placeholder="Phone"
                {...register("phone", {
                  required: "Phone number is required",
                  minLength: {
                    value: 7,
                    message: "Enter a valid phone number",
                  },
                })}
              />

              {errors.phone && (
                <p className="helper" style={{ color: "#ffb3b3" }}>
                  {errors.phone.message}
                </p>
              )}
            </div>
          </div>

          {/* Services */}
          <select
            {...register("serviceId", {
              required: "Please select a service",
            })}
          >
            <option value="">Select a service</option>

            {filteredServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Date + Time */}
          <div className="row">
            <input
              type="date"
              {...register("date", { required: true })}
              min={dayjs().format("YYYY-MM-DD")}
              style={{
                color: closedDates.includes(selectedDate)
                  ? "red"
                  : "inherit",
                borderColor: closedDates.includes(selectedDate)
                  ? "red"
                  : "inherit",
              }}
            />

            <select {...register("time", { required: true })}>
              <option value="">Select a time</option>

              {availableTimes.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          {selectedDate && closedDates.includes(selectedDate) && (
            <p className="helper">We are closed on this date.</p>
          )}

          {selectedDate &&
            selectedService &&
            !closedDates.includes(selectedDate) &&
            availableTimes.length === 0 && (
              <p className="helper">
                No available time slots for this date.
              </p>
            )}

          {/* Notes */}
          <textarea
            rows={4}
            placeholder="Notes for your stylist…"
            {...register("notes")}
          />

          {/* Submit */}
          <button type="submit">Pay £10 Deposit</button>

          {message && <div className="alert">{message}</div>}
        </form>
      </section>

      {/* Policies */}
      <section className="panel" style={{ marginTop: 22 }}>
        <h2 className="section-title">Policies</h2>

        <ul className="policies">
          <li className="policy">
            £10 non-refundable deposit (deducted from total). Remainder paid
            in cash.
          </li>

          <li className="policy">
            Hair must be washed, clean and detangled — extra fees otherwise.
          </li>

          <li className="policy">
            If blow-drying is required, please select that option.
          </li>

          <li className="policy">
            DM for any alternative hairstyles not listed.
          </li>

          <li className="policy">
            £10 late fee after 15 minutes; after 30 minutes the appointment is
            cancelled.
          </li>

          <li className="policy">
            No plus ones unless discussed.
          </li>

          <li className="policy">
            48-hour notice for cancellations.
          </li>

          <li className="policy">
            For women's styles, extensions brought must be pre-stretched.
          </li>
        </ul>

        <h3 className="section-title" style={{ marginTop: 22 }}>
          Add-ons
        </h3>

        <ul className="policies">
          <li className="policy">
            Hair can be provided — price depends on number of packs and style.
          </li>

          <li className="policy">
            Blow-drying is free.
          </li>

          <li className="policy">
            Custom colour for extensions: +£10.
          </li>
        </ul>
      </section>
    </>
  );
}

export default function App() {
  return (
    <>
      <div className="site-bg">
        <div className="blob one" />
        <div className="blob two" />
        <div className="blob gold" />
      </div>

      <div className="wrapper">
        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route
            path="/booking-success"
            element={<BookingSuccess />}
          />

          <Route
            path="/booking-cancelled"
            element={<BookingCancelled />}
          />

          <Route
            path="/admin"
            element={
              <>
                <div style={{ marginBottom: 16 }}>
                  <Link
                    to="/"
                    className="helper"
                    style={{ textDecoration: "none" }}
                  >
                    ← Back to booking
                  </Link>
                </div>

                <Admin />
              </>
            }
          />
        </Routes>
      </div>
    </>
  );
}