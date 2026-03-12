import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import "../styles/auth.css";

function Login() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  const submit = async () => {
    if (!form.email.trim() || !form.password.trim()) {
      setError("Email and password are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await API.post("/auth/login", {
        email: form.email.trim(),
        password: form.password
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data._id);
      localStorage.setItem("role", res.data.role || "user");
      socket.emit("user-online", res.data._id);

      if (res.data.role === "institute_admin") {
        navigate("/institute-dashboard");
      } else {
        navigate("/home");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-glow auth-glow-left" aria-hidden="true" />
      <div className="auth-glow auth-glow-right" aria-hidden="true" />

      <div className="auth-card auth-card-entrance">
        <div className="auth-head">
          <p className="auth-eyebrow">Code Arena</p>
          <h2>User Login</h2>
          <p className="auth-sub">Sign in to continue your solo and duel challenges.</p>
        </div>

        <div className="auth-form">
          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              placeholder="Enter password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>

          {!!error && <p className="auth-error">{error}</p>}

          <button className="auth-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Signing in..." : "Login"}
          </button>
        </div>

        <div className="auth-row-links">
          <p>
            Don&apos;t have an account? <Link to="/register">Sign Up</Link>
          </p>
          <Link to="/forgot-password">Forgot Password?</Link>
        </div>

        <div className="auth-divider">or continue with</div>

        <div className="auth-social-grid">
          <button className="auth-secondary" onClick={() => { window.location.href = "http://localhost:5000/api/auth/google"; }}>
            Google
          </button>
          <button className="auth-secondary" onClick={() => { window.location.href = "http://localhost:5000/api/auth/github"; }}>
            GitHub
          </button>
        </div>

        <div className="auth-admin-links">
          <p>
            Institute Admin? <Link to="/institute-login">Login here</Link>
          </p>
          <p>
            Need a new institute? <Link to="/institute-register">Register Institute</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
