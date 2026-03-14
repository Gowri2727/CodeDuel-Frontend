import axios from "axios";

const backendUrl = String(import.meta?.env?.VITE_BACKEND_URL || "https://codeduel-backend-25xt.onrender.com")
  .trim()
  .replace(/\/+$/, "");

const API = axios.create({
  baseURL: `${backendUrl}/api`,
});

export default API;
