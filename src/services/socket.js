import { io } from "socket.io-client";

const backendUrl = String(import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000")
  .trim()
  .replace(/\/+$/, "");

const socket = io(backendUrl, {
  transports: ["websocket", "polling"]
});

export default socket;
