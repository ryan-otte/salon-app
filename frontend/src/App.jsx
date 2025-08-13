import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import dayjs from "dayjs";
import "./App.css";

export default function App() {
  const [services, setServices] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    axios.get("/api/services").then((r) => setServices(r.data));
  }, []);

  const { register, watch, setValue, handleSubmit, reset } = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      staffId: 1,
      serviceId: "",
      date: dayjs().format("YYYY-MM-DD"),
      time: "10:00",
      notes: "",
    },
  });

  const selectedServiceId = watch("serviceId");
  const selectedService = useMemo(
    () => services.find((s) => String(s.id) === String(selectedServiceId)),
    [services, selectedServiceId]
  );

  const pounds = (cents) =>
    (cents / 100).toLocaleString(undefined, { style: "currency", currency: "GBP" });

  const onSubmit = async (data) => {
    setMessage("");
    const startTs = dayjs(`${data.date}T${data.time}`).toISOString();
    try {
      await axios.post("/api/appointments", {
        customer: { name: data.name, email: data.email, phone: data.phone },
        staffId: Number(data.staffId),
        serviceId: Number(data.serviceId),
        startTs,
        notes: data.notes || undefined,
      });
      setMessage("Appointment booked! 🎉");
      reset({
        name: "",
        email: "",
        phone: "",
        staffId: 1,
        serviceId: "",
        date: dayjs().format("YYYY-MM-DD"),
        time: "10:00",
        notes: "",
      });
    } catch (e) {
      setMessage(e.response?.data?.error || "Booking failed");
    }
  };

  return (
    <div className="wrapper">
      <h1 className="page-title">Book Your Appointment</h1>
      <p className="sub">Choose a service, then pick a date and time.</p>

      <div className="grid">
        {/* Services */}
        <section className="panel">
          <h2 className="section-title">Our Services</h2>
          <ul className="services">
            {services.map((s) => {
              const active = String(s.id) === String(selectedServiceId);
              return (
                <li
                  key={s.id}
                  className={`service ${active ? "active" : ""}`}
                  onClick={() => setValue("serviceId", String(s.id), { shouldValidate: true })}
                >
                  <input type="radio" name="service-choice" checked={active} readOnly />
                  <div className="name">{s.name}</div>
                  <div className="meta">
                    <span>{s.durationMin} min</span>
                    <span>{pounds(s.priceCents)}</span>
                  </div>
                  {s.description && <div className="desc">{s.description}</div>}
                </li>
              );
            })}
          </ul>
          {!selectedService && (
            <p className="helper">Tip: click a card to select a service.</p>
          )}
        </section>

        {/* Booking form */}
        <section className="panel">
          <h2 className="section-title">Book Now</h2>

          {selectedService && (
            <p className="helper">
              Booking: <strong>{selectedService.name}</strong> • {selectedService.durationMin} min •{" "}
              {pounds(selectedService.priceCents)}
            </p>
          )}

          <form className="form" onSubmit={handleSubmit(onSubmit)}>
            <div className="row">
              <input placeholder="Your name" {...register("name", { required: true })} />
            </div>

            <div className="row">
              <input placeholder="Email (optional)" {...register("email")} />
              <input placeholder="Phone (optional)" {...register("phone")} />
            </div>

            {/* Keep select for accessibility / keyboard users */}
            <select {...register("serviceId", { required: true })}>
              <option value="">Select a service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.durationMin} min — {pounds(s.priceCents)}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Staff ID (e.g., 1)"
              {...register("staffId", { required: true, min: 1 })}
            />

            <div className="row">
              <input type="date" {...register("date", { required: true })} />
              <input type="time" {...register("time", { required: true })} />
            </div>

            <textarea rows={4} placeholder="Notes for your stylist…" {...register("notes")} />

            <button type="submit">Confirm Booking</button>
            {message && <div className="alert">{message}</div>}
          </form>
        </section>
      </div>
    </div>
  );
}
