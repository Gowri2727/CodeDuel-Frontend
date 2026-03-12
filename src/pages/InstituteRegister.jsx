import { useState } from "react";
import API from "../services/api";
import { useNavigate } from "react-router-dom";
import "../styles/institute.css";

export default function InstituteRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    code: "",
    place: "",
    adminEmail: "",
    adminPassword: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordPolicyHint = "Use at least 8 characters with upper, lower, number and special character.";

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.place.trim() || !form.adminEmail.trim() || !form.adminPassword.trim()) {
      setError("All fields are required.");
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/.test(form.adminPassword)) {
      setError(passwordPolicyHint);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        place: form.place.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword
      };
      await API.post("/institute-auth/register", payload);
      setSuccess("Institute registered successfully. Redirecting to admin login...");
      setTimeout(() => navigate("/institute-login"), 1200);
    } catch (err) {
      if (!err?.response) {
        setError("Backend is not reachable at http://localhost:5000. Start the backend server and try again.");
      } else {
        setError(err.response?.data?.message || "Registration failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card slide-up">
        <h2>Institute Registration</h2>

        <input
          placeholder="Institute Name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />

        <input
          placeholder="Institute Code"
          value={form.code}
          onChange={e => setForm({ ...form, code: String(e.target.value || "").toUpperCase() })}
        />

        <input
          placeholder="Place"
          value={form.place}
          onChange={e => setForm({ ...form, place: e.target.value })}
        />

        <input
          placeholder="Admin Email"
          value={form.adminEmail}
          onChange={e => setForm({ ...form, adminEmail: e.target.value })}
        />

        <input
          type="password"
          placeholder="Admin Password"
          value={form.adminPassword}
          onChange={e => setForm({ ...form, adminPassword: e.target.value })}
        />
        <p className="institute-note" style={{ marginTop: 8 }}>{passwordPolicyHint}</p>

        {!!error && <p style={{ color: "#fecaca", textAlign: "left" }}>{error}</p>}
        {!!success && <p className="institute-success">{success}</p>}

        <button
          className="glow-btn"
          onClick={submit}
          disabled={submitting}
          type="button"
        >
          {submitting ? "Registering..." : "Register Institute"}
        </button>
      </div>
    </div>
  );
}
