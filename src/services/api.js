import axios from "axios";

const backendUrl = String(import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000")
  .trim()
  .replace(/\/+$/, "");

const API = axios.create({
  baseURL: `${backendUrl}/api`,
});

export default API;
