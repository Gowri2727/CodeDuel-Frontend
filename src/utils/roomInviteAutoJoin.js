const ROOM_INVITE_AUTO_JOIN_KEY = "room_invite_auto_join";
const ROOM_INVITE_AUTO_JOIN_TTL_MS = 2 * 60 * 60 * 1000;

function normalizeRoomCode(value) {
  return String(value || "").trim().toUpperCase();
}

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function setPendingRoomAutoJoin(payload) {
  const storage = getStorage();
  if (!storage) return;

  const roomCode = normalizeRoomCode(payload?.roomCode);
  if (!roomCode) return;

  const next = {
    roomCode,
    inviteId: String(payload?.inviteId || ""),
    acceptedAt: Number(payload?.acceptedAt || Date.now()),
    acceptedWhileMode: String(payload?.acceptedWhileMode || "")
  };

  storage.setItem(ROOM_INVITE_AUTO_JOIN_KEY, JSON.stringify(next));
}

export function getPendingRoomAutoJoin() {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(ROOM_INVITE_AUTO_JOIN_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const roomCode = normalizeRoomCode(parsed?.roomCode);
    const acceptedAt = Number(parsed?.acceptedAt || 0);
    if (!roomCode || !acceptedAt) {
      storage.removeItem(ROOM_INVITE_AUTO_JOIN_KEY);
      return null;
    }

    if (Date.now() - acceptedAt > ROOM_INVITE_AUTO_JOIN_TTL_MS) {
      storage.removeItem(ROOM_INVITE_AUTO_JOIN_KEY);
      return null;
    }

    return {
      roomCode,
      inviteId: String(parsed?.inviteId || ""),
      acceptedAt,
      acceptedWhileMode: String(parsed?.acceptedWhileMode || "")
    };
  } catch {
    storage.removeItem(ROOM_INVITE_AUTO_JOIN_KEY);
    return null;
  }
}

export function clearPendingRoomAutoJoin() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(ROOM_INVITE_AUTO_JOIN_KEY);
}

export function buildRoomAutoJoinPath(roomCode) {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized) return "/room";
  return `/room?autoJoin=${encodeURIComponent(normalized)}`;
}
