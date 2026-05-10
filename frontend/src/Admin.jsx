import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";

export default function Admin() {
  const [adminKey, setAdminKey] = useState(localStorage.getItem("ADMIN_KEY") || "");
  const [tempKey, setTempKey] = useState("");
  const [error, setError] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [closedDays, setClosedDays] = useState([]);
  const [closedDayInput, setClosedDayInput] = useState("");
  const [loading, setLoading] = useState(false);

  const authed = useMemo(() => Boolean(adminKey), [adminKey]);

  const fetchAppointments = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await axios.get("/api/admin/appointments", {
        headers: { "x-admin-key": adminKey },
      });
      setAppointments(r.data);
    } catch (e) {
      setAppointments([]);
      setError(e.response?.data?.error || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  };

  const fetchClosedDays = async () => {
    try {
      const r = await axios.get("/api/closed-days");
      setClosedDays(r.data);
    } catch {
      setClosedDays([]);
    }
  };

  useEffect(() => {
    if (authed) {
      fetchAppointments();
      fetchClosedDays();
    }
  }, [authed]);

  const onLogin = () => {
    setError("");
    localStorage.setItem("ADMIN_KEY", tempKey);
    setAdminKey(tempKey);
    setTempKey("");
  };

  const onLogout = () => {
    localStorage.removeItem("ADMIN_KEY");
    setAdminKey("");
    setAppointments([]);
    setClosedDays([]);
  };

  const cancelAppointment = async (id) => {
    setError("");
    try {
      await axios.patch(`/api/admin/appointments/${id}/cancel`, null, {
        headers: { "x-admin-key": adminKey },
      });
      await fetchAppointments();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to cancel appointment");
    }
  };

  const completeAppointment = async (id) => {
    setError("");
    try {
      await axios.patch(`/api/admin/appointments/${id}/complete`, null, {
        headers: { "x-admin-key": adminKey },
      });
      await fetchAppointments();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to complete appointment");
    }
  };

  const toggleClosedDay = async () => {
    setError("");
    if (!closedDayInput) return;

    try {
      await axios.post(
        "/api/admin/closed-days/toggle",
        { day: closedDayInput },
        { headers: { "x-admin-key": adminKey } }
      );
      setClosedDayInput("");
      await fetchClosedDays();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to update closed days");
    }
  };

  if (!authed) {
    return (
      <div className="panel" style={{ maxWidth: 520, margin: "30px auto" }}>
        <h2 className="section-title">Admin Login</h2>
        <p className="helper">Enter the owner password to view bookings.</p>

        <div className="form">
          <input
            type="password"
            placeholder="Admin password"
            value={tempKey}
            onChange={(e) => setTempKey(e.target.value)}
          />
          <button type="button" onClick={onLogin}>
            Login
          </button>
          {error && <div className="alert">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel" style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Upcoming Appointments
          </h2>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={fetchAppointments}>
              Refresh
            </button>

            <button type="button" onClick={onLogout} style={{ filter: "grayscale(0.2)" }}>
              Logout
            </button>
          </div>
        </div>

        {error && <div className="alert" style={{ marginTop: 12 }}>{error}</div>}
        {loading && <p className="helper" style={{ marginTop: 12 }}>Loading…</p>}

        {!loading && appointments.length === 0 && (
          <p className="helper" style={{ marginTop: 12 }}>No appointments found.</p>
        )}

        {!loading && appointments.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                  <th style={{ padding: "10px 8px" }}>Date</th>
                  <th style={{ padding: "10px 8px" }}>Time</th>
                  <th style={{ padding: "10px 8px" }}>Service</th>
                  <th style={{ padding: "10px 8px" }}>Category</th>
                  <th style={{ padding: "10px 8px" }}>Customer</th>
                  <th style={{ padding: "10px 8px" }}>Phone</th>
                  <th style={{ padding: "10px 8px" }}>Notes</th>
                  <th style={{ padding: "10px 8px" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {appointments.map((a) => {
                  const d = dayjs(a.startTs);
                  const date = d.format("DD/MM/YYYY");
                  const time = d.format("HH:mm");

                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                      <td style={{ padding: "10px 8px" }}>{date}</td>
                      <td style={{ padding: "10px 8px" }}>{time}</td>
                      <td style={{ padding: "10px 8px" }}>{a.service?.name}</td>
                      <td style={{ padding: "10px 8px" }}>{a.service?.category}</td>
                      <td style={{ padding: "10px 8px" }}>{a.customer?.name}</td>
                      <td style={{ padding: "10px 8px" }}>{a.customer?.phone || "-"}</td>

                      <td
                        style={{
                          padding: "10px 8px",
                          maxWidth: 260,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.notes || "-"}
                      </td>

                      <td style={{ padding: "10px 8px", display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => completeAppointment(a.id)}>
                          Done
                        </button>

                        <button type="button" onClick={() => cancelAppointment(a.id)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <h2 className="section-title">Availability</h2>

        <div className="form">
          <div className="row">
            <input
              type="date"
              value={closedDayInput}
              onChange={(e) => setClosedDayInput(e.target.value)}
            />
            <button type="button" onClick={toggleClosedDay}>
              Toggle Closed Day
            </button>
          </div>
        </div>

        {closedDays.length > 0 ? (
          <ul className="policies" style={{ marginTop: 12 }}>
            {closedDays.map((d) => (
              <li key={d.id || d.day} className="policy">
                {d.day}
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper" style={{ marginTop: 12 }}>No closed days set.</p>
        )}
      </div>
    </>
  );
}