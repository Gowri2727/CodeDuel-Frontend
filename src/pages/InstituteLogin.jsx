import { useState } from "react";
import API from "../services/api";
import { useNavigate } from "react-router-dom";
import socket from "../services/socket";
import "../styles/institute.css";

export default function InstituteLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.code.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Institute code, email, and password are required.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await API.post("/institute-auth/login", {
        code: form.code.trim().toUpperCase(),
        email: form.email.trim(),
        password: form.password
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data._id);
      localStorage.setItem("role", res.data.role || "institute_admin");
      localStorage.setItem("institutionCode", res.data.institutionCode || form.code.trim().toUpperCase());
      if (res.data.institutionId) {
        localStorage.setItem("institutionId", res.data.institutionId);
      }
      socket.emit("user-online", res.data._id);

      navigate("/institute-dashboard");
    } catch (err) {
      if (!err?.response) {
        setError("Backend is not reachable at http://localhost:5000. Start the backend server and try again.");
      } else {
        setError(err.response?.data?.message || "Invalid admin credentials");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card slide-down">
        <h2>Institute Admin Login</h2>

        <input
          placeholder="Institute Code"
          value={form.code}
          onChange={e => setForm({ ...form, code: String(e.target.value || "").toUpperCase() })}
        />

        <input
          placeholder="Admin Email"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />

        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
        />

        {!!error && <p className="institute-error">{error}</p>}

        <button
          className="glow-btn"
          onClick={submit}
          disabled={submitting}
          type="button"
        >
          {submitting ? "Logging in..." : "Login"}
        </button>
      </div>
    </div>
  );
}
