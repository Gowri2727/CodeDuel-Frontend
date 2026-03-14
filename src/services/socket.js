import { io } from "socket.io-client";

const backendUrl = String(import.meta?.env?.VITE_BACKEND_URL || "https://codeduel-backend-25xt.onrender.com")
  .trim()
  .replace(/\/+$/, "");

const socket = io(backendUrl, {
  transports: ["websocket", "polling"]
});

export default socket;
