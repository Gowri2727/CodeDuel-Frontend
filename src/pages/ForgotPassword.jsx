import { useState } from "react";
import API from "../services/api";
import { useNavigate } from "react-router-dom";
import "../styles/auth.css";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const resetHandler = async () => {
    if (!email.trim() || !newPassword.trim()) {
      setError("Email and new password are required.");
      setSuccess("");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await API.post("/auth/reset-password", {
        email: email.trim(),
        newPassword
      });
      setSuccess(res.data?.message || "Password updated successfully.");
      setTimeout(() => navigate("/login"), 900);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password.");
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
          <h2>Reset Password</h2>
        </div>

        <div className="auth-form">
          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </label>

          <label>
            <span>New Password</span>
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") resetHandler();
              }}
            />
          </label>

          {!!error && <p className="auth-error">{error}</p>}
          {!!success && <p className="auth-sub">{success}</p>}

          <button className="auth-primary" onClick={resetHandler} disabled={submitting}>
            {submitting ? "Resetting..." : "Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
