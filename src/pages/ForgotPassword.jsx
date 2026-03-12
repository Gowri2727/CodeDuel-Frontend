import { useState } from "react";
import API from "../services/api";
import { useNavigate } from "react-router-dom";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const navigate = useNavigate();

  const resetHandler = async () => {
    try {
      await API.post("/auth/reset-password", { email, newPassword });
      alert("Password updated");
      navigate("/");
    } catch {
      alert("User not found");
    }
  };

  return (
    <div className="container">
      <h2>Reset Password</h2>

      <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="New Password" onChange={e => setNewPassword(e.target.value)} />

      <button onClick={resetHandler}>Reset</button>
    </div>
  );
}

export default ForgotPassword;
