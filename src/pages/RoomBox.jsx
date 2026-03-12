import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import "../styles/room-box.css";

function starter(language) {
  const lang = String(language || "python").toLowerCase();
  if (lang.includes("python")) return "class Solution:\n    def solve(self, data):\n        pass\n";
  if (lang.includes("java")) return "class Solution {\n    public Object solve(Object data) {\n        return null;\n    }\n}\n";
  if (lang.includes("javascript")) return "function solve(data) {\n  // logic\n}\n";
  return "// write logic here\n";
}

function left(expiresAt) {
  if (!expiresAt) return 0;
  return Math.max(Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000), 0);
}

function renderObject(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function RemoteMediaTile({ stream, name, micOn, cameraOn }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
    if (audioRef.current) audioRef.current.srcObject = stream || null;
  }, [stream]);

  const badge = String(name || "U").trim().slice(0, 1).toUpperCase() || "U";

  return (
    <div className="video-tile">
      {stream && cameraOn ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className="video-placeholder">{badge}</div>
      )}
      <audio ref={audioRef} autoPlay />
      <p>{name || "User"} | Mic {micOn ? "On" : "Off"} | Camera {cameraOn ? "On" : "Off"}</p>
    </div>
  );
}

function RoomBox() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [userModes, setUserModes] = useState({});

  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState(null);
  const [question, setQuestion] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submission, setSubmission] = useState({ submittedCount: 0, totalPlayers: 0, players: [] });
  const [result, setResult] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [compareRes, setCompareRes] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [outgoingInvites, setOutgoingInvites] = useState({});
  const [friendMsg, setFriendMsg] = useState("");
  const [removeCandidate, setRemoveCandidate] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [mediaByUser, setMediaByUser] = useState({});
  const [startingMatch, setStartingMatch] = useState(false);
  const [startTopicInput, setStartTopicInput] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [mediaError, setMediaError] = useState("");

  const [settings, setSettings] = useState({
    difficulty: "Easy",
    type: "DSA",
    isCross: false,
    preferredLanguage: "python",
    durationSeconds: 900
  });

  const roomCodeRef = useRef("");
  const resultRef = useRef(null);
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const settingsRef = useRef(settings);
  const micOnRef = useRef(micOn);
  const cameraOnRef = useRef(cameraOn);
  const pendingOfferRef = useRef({});
  const makingOfferRef = useRef({});
  const ignoreOfferRef = useRef({});
  const autoJoinHandledRef = useRef("");

  const myPlayer = (room?.players || []).find(player => String(player.userId) === String(userId));
  const isAdmin = Boolean(myPlayer?.isAdmin || String(room?.admin || "") === String(userId));
  const rankedPlayers = result?.rankedPlayers || [];
  const selected = rankedPlayers.find(player => String(player.userId) === String(selectedUserId));
  const roomStartLocked = Boolean(startingMatch || room?.startInProgress);

  const attachLocalVideo = stream => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream || null;
    }
  };

  const applyTrackState = stream => {
    if (!stream) return;
    stream.getAudioTracks().forEach(track => {
      track.enabled = Boolean(micOnRef.current);
    });
    stream.getVideoTracks().forEach(track => {
      track.enabled = Boolean(cameraOnRef.current);
    });
  };

  const stopLocalStream = (skipStateUpdate = false) => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    localStreamRef.current = null;
    attachLocalVideo(null);
    if (!skipStateUpdate) setLocalStream(null);
  };

  const closePeer = peerUserId => {
    const key = String(peerUserId || "");
    if (!key) return;
    const pc = peerConnectionsRef.current[key];
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      delete peerConnectionsRef.current[key];
    }
    delete pendingOfferRef.current[key];
    delete makingOfferRef.current[key];
    delete ignoreOfferRef.current[key];
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const closeAllPeers = () => {
    Object.keys(peerConnectionsRef.current).forEach(closePeer);
  };

  const ensureLocalStream = async () => {
    const existing = localStreamRef.current;
    if (existing) {
      applyTrackState(existing);
      return existing;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error("Media devices are not supported in this browser.");
      setMediaError(error.message);
      throw error;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      applyTrackState(stream);
      setMediaError("");
      return stream;
    } catch (err) {
      setMediaError(err?.message || "Unable to access camera/microphone.");
      throw err;
    }
  };

  const shouldCreateOffer = peerUserId => String(userId || "") < String(peerUserId || "");

  const addTracksIfNeeded = (pc, stream) => {
    if (!pc || !stream) return false;
    let added = false;
    stream.getTracks().forEach(track => {
      const alreadyAdded = pc.getSenders().some(sender => sender.track && sender.track.id === track.id);
      if (!alreadyAdded) {
        pc.addTrack(track, stream);
        added = true;
      }
    });
    return added;
  };

  const getOrCreatePeer = async peerUserId => {
    const key = String(peerUserId || "");
    if (!key) return null;
    if (peerConnectionsRef.current[key]) return peerConnectionsRef.current[key];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peerConnectionsRef.current[key] = pc;

    pc.onicecandidate = event => {
      if (!event.candidate || !roomCodeRef.current) return;
      socket.emit("room-webrtc-ice", {
        roomCode: roomCodeRef.current,
        fromUserId: userId,
        targetUserId: key,
        candidate: event.candidate
      });
    };

    pc.ontrack = event => {
      const stream = event.streams?.[0];
      if (!stream) return;
      setRemoteStreams(prev => ({ ...prev, [key]: stream }));
    };

    if (micOnRef.current || cameraOnRef.current) {
      const stream = await ensureLocalStream();
      addTracksIfNeeded(pc, stream);
    }

    return pc;
  };

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

  useEffect(() => {
    roomCodeRef.current = room?.roomCode || "";
  }, [room]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoJoinCode = String(params.get("autoJoin") || "").trim().toUpperCase();
    if (!autoJoinCode || !userId) return;
    if (autoJoinHandledRef.current === autoJoinCode) return;
    autoJoinHandledRef.current = autoJoinCode;
    setJoinCode(autoJoinCode);
    setNote(`Joining invited room ${autoJoinCode}...`);
    socket.emit("room-rejoin", { roomCode: autoJoinCode, userId });
    navigate("/room", { replace: true });
  }, [location.search, navigate, userId]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    localStreamRef.current = localStream;
    attachLocalVideo(localStream || null);
  }, [localStream]);

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    applyTrackState(stream);
    if (!micOn && !cameraOn) {
      stopLocalStream();
    }
  }, [micOn, cameraOn]);

  useEffect(() => {
    API.get("/users/me", headers).then(res => {
      setProfile(res.data || null);
      const language = res.data?.languages?.[0] || "python";
      setSettings(prev => ({ ...prev, preferredLanguage: language }));
    }).catch(() => setNote("Failed to load profile."));

    API.get("/friends", headers)
      .then(res => setFriends(res.data?.friends || []))
      .catch(() => setFriends([]));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setIncomingInvites(prev =>
        prev
          .map(item => ({ ...item, secondsLeft: left(item.expiresAt) }))
          .filter(item => item.secondsLeft > 0)
      );

      setOutgoingInvites(prev => {
        const next = {};
        Object.entries(prev).forEach(([inviteId, inviteData]) => {
          const secondsLeft = left(inviteData.expiresAt);
          if (inviteData.status !== "sent" || secondsLeft > 0) {
            next[inviteId] = { ...inviteData, secondsLeft };
          }
        });
        return next;
      });
    }, 1000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!room?.settings) return;
    setSettings(prev => ({
      ...prev,
      difficulty: room.settings.difficulty || prev.difficulty,
      type: room.settings.type || prev.type,
      isCross: typeof room.settings.isCross === "boolean" ? room.settings.isCross : prev.isCross,
      preferredLanguage: room.settings.preferredLanguage || prev.preferredLanguage,
      durationSeconds: Number(room.settings.durationSeconds || prev.durationSeconds || 900)
    }));
  }, [
    room?.settings?.difficulty,
    room?.settings?.type,
    room?.settings?.isCross,
    room?.settings?.preferredLanguage,
    room?.settings?.durationSeconds
  ]);

  useEffect(() => {
    if (room?.status !== "waiting") {
      setStartTopicInput("");
      setRemoveCandidate(null);
    }
  }, [room?.status]);

  useEffect(() => {
    if (!removeCandidate?.targetUserId) return;
    const targetStillInRoom = (room?.players || []).some(
      player => String(player.userId) === String(removeCandidate.targetUserId)
    );
    if (!targetStillInRoom) {
      setRemoveCandidate(null);
    }
  }, [room?.players, removeCandidate?.targetUserId]);

  useEffect(() => {
    const mapped = {};
    (room?.players || []).forEach(player => {
      const key = String(player.userId || "");
      mapped[key] = {
        micOn: Boolean(player.media?.micOn),
        cameraOn: Boolean(player.media?.cameraOn)
      };
    });
    setMediaByUser(mapped);
  }, [room?.players]);

  useEffect(() => {
    const onConnect = () => {
      if (userId) {
        socket.emit("user-online", userId);
      }
      if (roomCodeRef.current) {
        socket.emit("room-rejoin", { roomCode: roomCodeRef.current, userId });
      }
    };

    socket.on("connect", onConnect);
    const onOnlineUsers = users => setOnlineUsers(users || []);
    const onUserModeSnapshot = snap => setUserModes(snap || {});
    const onUserModeUpdate = data => {
      if (!data?.userId) return;
      setUserModes(prev => ({ ...prev, [String(data.userId)]: data }));
    };

    socket.on("online-users", onOnlineUsers);
    socket.on("user-mode-snapshot", onUserModeSnapshot);
    socket.on("user-mode-update", onUserModeUpdate);

    socket.on("room-created", payload => {
      setRoom(payload || null);
      setQuestion(payload?.question || null);
      setMessages([]);
      setResult(null);
      setSubmitted(false);
      setRunResult(null);
      setStartingMatch(false);
    });

    socket.on("room-updated", payload => {
      setRoom(payload || null);
      setQuestion(payload?.question || null);
      if (payload?.status && payload.status !== "waiting") {
        setStartingMatch(false);
      }
    });

    socket.on("room-error", message => {
      setNote(String(message || "Room error"));
      setStartingMatch(false);
    });

    socket.on("room-player-left", payload => {
      if (payload?.reason) {
        setNote(payload.reason);
      }
    });

    socket.on("room-force-removed", payload => {
      sessionStorage.setItem("room_removed_notice", payload?.message || "You were removed from the room by admin.");
      socket.emit("room-leave", {
        roomCode: roomCodeRef.current,
        userId,
        reason: "Removed by admin."
      });
      closeAllPeers();
      stopLocalStream();
      setRoom(null);
      setQuestion(null);
      setResult(null);
      setMessages([]);
      setSubmitted(false);
      setStartingMatch(false);
      setStartTopicInput("");
      navigate("/home");
    });

    socket.on("room-player-removed", payload => {
      const targetUserId = String(payload?.targetUserId || "");
      if (!targetUserId) return;

      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: (prev.players || []).filter(player => String(player.userId) !== targetUserId)
        };
      });
      setSubmission(prev => ({
        ...prev,
        players: (prev.players || []).filter(player => String(player.userId) !== targetUserId),
        submittedCount: (prev.players || []).filter(player => String(player.userId) !== targetUserId && player.submitted).length,
        totalPlayers: Math.max(
          0,
          (prev.players || []).filter(player => String(player.userId) !== targetUserId).length
        )
      }));
      setRemoveCandidate(prev => (
        String(prev?.targetUserId || "") === targetUserId ? null : prev
      ));

      if (targetUserId !== String(userId)) {
        const targetName = String(payload?.targetName || "Player");
        setNote(`${targetName} removed from the room by admin.`);
        return;
      }

      sessionStorage.setItem("room_removed_notice", payload?.message || "You were removed from the room by admin.");
      socket.emit("room-leave", {
        roomCode: roomCodeRef.current,
        userId,
        reason: "Removed by admin."
      });
      closeAllPeers();
      stopLocalStream();
      setRoom(null);
      setQuestion(null);
      setResult(null);
      setMessages([]);
      setSubmitted(false);
      setStartingMatch(false);
      setStartTopicInput("");
      setRemoveCandidate(null);
      navigate("/home");
    });

    socket.on("room-started", payload => {
      const payloadRoom = payload?.room || null;
      const payloadPlayers = Array.isArray(payloadRoom?.players) ? payloadRoom.players : [];
      const me = payloadPlayers.find(player => String(player.userId) === String(userId));
      const nextQuestion = payload?.question || null;
      setQuestion(nextQuestion);
      setCode(nextQuestion?.starterCode || starter(me?.language || settingsRef.current.preferredLanguage));
      setSubmitted(false);
      setRunResult(null);
      setResult(null);
      setRemaining(left(payload?.deadlineAt));
      setRoom(prev => ({
        ...(prev || {}),
        ...(payloadRoom || {}),
        status: "coding"
      }));
      setStartingMatch(false);
      setStartTopicInput("");
      socket.emit("room-activity-ping", {
        roomCode: payload?.roomCode || roomCodeRef.current,
        userId
      });
    });

    socket.on("room-timer", payload => {
      setRemaining(Number(payload?.remainingSeconds || 0));
    });

    socket.on("room-run-result", payload => {
      setRunning(false);
      setRunResult(payload || null);
    });

    socket.on("room-submit-ack", payload => {
      setSubmitted(Boolean(payload?.submitted));
      setSubmission(prev => ({
        ...prev,
        submittedCount: Number(payload?.submittedCount || prev.submittedCount || 0),
        totalPlayers: Number(payload?.totalPlayers || prev.totalPlayers || 0)
      }));
    });

    socket.on("room-submit-error", payload => {
      setSubmitted(false);
      setNote(payload?.message || "Submit failed");
    });

    socket.on("room-submission-update", payload => {
      setSubmission({
        submittedCount: Number(payload?.submittedCount || 0),
        totalPlayers: Number(payload?.totalPlayers || 0),
        players: Array.isArray(payload?.players) ? payload.players : []
      });
    });

    socket.on("room-result", payload => {
      setResult(payload || null);
      setSubmitted(true);
      setRunning(false);
      setSelectedUserId(String(payload?.rankedPlayers?.[0]?.userId || ""));
      setRoom(prev => ({ ...(prev || {}), status: "finished" }));
      socket.emit("room-rejoin", { roomCode: roomCodeRef.current, userId });
    });

    socket.on("room-message", payload => {
      setMessages(prev => [...prev, payload]);
    });

    socket.on("room-chat-sync", payload => {
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    });

    socket.on("room-rejoin-ack", payload => {
      if (!payload?.ok) return;
      if (payload?.room) {
        setRoom(payload.room);
        setQuestion(payload?.room?.question || null);
      }
      if (payload?.result) {
        setResult(payload.result);
        setSelectedUserId(String(payload?.result?.rankedPlayers?.[0]?.userId || ""));
      }
    });

    socket.on("room-invite-received", payload => {
      setIncomingInvites(prev => [
        ...prev.filter(item => item.inviteId !== payload?.inviteId),
        { ...payload, secondsLeft: left(payload?.expiresAt) }
      ]);
    });

    socket.on("room-invite-status", payload => {
      if (!payload?.inviteId) return;
      setOutgoingInvites(prev => ({
        ...prev,
        [payload.inviteId]: {
          ...(prev[payload.inviteId] || {}),
          ...payload,
          secondsLeft: left(payload?.expiresAt)
        }
      }));
      setIncomingInvites(prev => prev.filter(item => item.inviteId !== payload.inviteId));
    });

    socket.on("room-compare-result", payload => {
      setCompareLoading(false);
      setCompareRes(payload?.ok ? payload : null);
      if (!payload?.ok) setNote(payload?.message || "Compare failed");
    });

    socket.on("room-player-afk", payload => {
      setNote(payload?.message || "A player was marked AFK and auto-submitted.");
    });

    socket.on("room-media-update", payload => {
      const key = String(payload?.userId || "");
      if (!key) return;
      setMediaByUser(prev => ({
        ...prev,
        [key]: {
          micOn: Boolean(payload?.micOn),
          cameraOn: Boolean(payload?.cameraOn)
        }
      }));
    });

    socket.on("room-peer-left", payload => {
      const key = String(payload?.userId || "");
      if (!key) return;
      closePeer(key);
      setMediaByUser(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    });

    socket.on("room-webrtc-offer", async payload => {
      try {
        const fromUserId = String(payload?.fromUserId || "");
        if (!fromUserId || !payload?.sdp) return;
        const incomingDescription = new RTCSessionDescription(payload.sdp);
        const isOffer = incomingDescription.type === "offer";
        const pc = await getOrCreatePeer(fromUserId);
        if (!pc) return;

        const polite = !shouldCreateOffer(fromUserId);
        const makingOffer = Boolean(makingOfferRef.current[fromUserId]);
        const offerCollision = isOffer && (makingOffer || pc.signalingState !== "stable");
        ignoreOfferRef.current[fromUserId] = !polite && offerCollision;
        if (ignoreOfferRef.current[fromUserId]) return;

        if (offerCollision && polite && pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
        }

        await pc.setRemoteDescription(incomingDescription);
        if (!isOffer) return;

        if (micOnRef.current || cameraOnRef.current) {
          const stream = await ensureLocalStream();
          addTracksIfNeeded(pc, stream);
        }
        if (pc.signalingState !== "have-remote-offer") return;
        const answer = await pc.createAnswer();
        if (pc.signalingState !== "have-remote-offer") return;
        await pc.setLocalDescription(answer);
        socket.emit("room-webrtc-answer", {
          roomCode: payload?.roomCode || roomCodeRef.current,
          fromUserId: userId,
          targetUserId: fromUserId,
          sdp: pc.localDescription || answer,
          offerId: payload?.offerId || ""
        });
      } catch (err) {
        const message = String(err?.message || "");
        if (!message.includes("Called in wrong state")) {
          setMediaError(message || "Unable to process incoming media offer.");
        }
      }
    });

    socket.on("room-webrtc-answer", async payload => {
      try {
        const fromUserId = String(payload?.fromUserId || "");
        const pc = peerConnectionsRef.current[fromUserId];
        if (!pc || !payload?.sdp) return;
        if (ignoreOfferRef.current[fromUserId]) return;
        const expectedOfferId = String(pendingOfferRef.current[fromUserId] || "");
        const answerOfferId = String(payload?.offerId || "");
        if (expectedOfferId && answerOfferId && expectedOfferId !== answerOfferId) return;
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        delete pendingOfferRef.current[fromUserId];
      } catch (err) {
        const message = String(err?.message || "");
        if (!message.includes("Called in wrong state")) {
          setMediaError(message || "Unable to process media answer.");
        }
      }
    });

    socket.on("room-webrtc-ice", async payload => {
      try {
        const fromUserId = String(payload?.fromUserId || "");
        const pc = peerConnectionsRef.current[fromUserId];
        if (!pc || !payload?.candidate) return;
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {}
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("online-users", onOnlineUsers);
      socket.off("user-mode-snapshot", onUserModeSnapshot);
      socket.off("user-mode-update", onUserModeUpdate);
      socket.off("room-created");
      socket.off("room-updated");
      socket.off("room-error");
      socket.off("room-player-left");
      socket.off("room-force-removed");
      socket.off("room-player-removed");
      socket.off("room-started");
      socket.off("room-timer");
      socket.off("room-run-result");
      socket.off("room-submit-ack");
      socket.off("room-submit-error");
      socket.off("room-submission-update");
      socket.off("room-result");
      socket.off("room-message");
      socket.off("room-chat-sync");
      socket.off("room-rejoin-ack");
      socket.off("room-invite-received");
      socket.off("room-invite-status");
      socket.off("room-compare-result");
      socket.off("room-player-afk");
      socket.off("room-media-update");
      socket.off("room-peer-left");
      socket.off("room-webrtc-offer");
      socket.off("room-webrtc-answer");
      socket.off("room-webrtc-ice");
      if (roomCodeRef.current && !resultRef.current) {
        socket.emit("room-leave", {
          roomCode: roomCodeRef.current,
          userId,
          reason: "Player left room page."
        });
      }
      closeAllPeers();
      stopLocalStream(true);
    };
  }, [userId]);

  useEffect(() => {
    if (!room?.roomCode || room?.status !== "coding") return undefined;
    let lastPingAt = 0;
    const sendActivity = () => {
      const now = Date.now();
      if (now - lastPingAt < 2500) return;
      lastPingAt = now;
      socket.emit("room-activity-ping", {
        roomCode: room.roomCode,
        userId
      });
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(eventName => window.addEventListener(eventName, sendActivity, { passive: true }));
    sendActivity();
    return () => {
      events.forEach(eventName => window.removeEventListener(eventName, sendActivity));
    };
  }, [room?.roomCode, room?.status, userId]);

  useEffect(() => {
    if (!room?.roomCode) return;
    socket.emit("room-media-state", {
      roomCode: room.roomCode,
      userId,
      micOn,
      cameraOn
    });
  }, [room?.roomCode, userId, micOn, cameraOn]);

  useEffect(() => {
    const roomCode = room?.roomCode;
    if (!roomCode) {
      closeAllPeers();
      return;
    }

    const peers = (room.players || []).filter(player => String(player.userId) !== String(userId));
    const peerIds = new Set(peers.map(player => String(player.userId)));
    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      if (!peerIds.has(peerId)) closePeer(peerId);
    });

    if (!micOn && !cameraOn) return;

    let cancelled = false;
    const connectPeers = async () => {
      try {
        const stream = await ensureLocalStream();
        if (cancelled) return;
        for (const peer of peers) {
          const peerUserId = String(peer.userId || "");
          if (!peerUserId) continue;
          const pc = await getOrCreatePeer(peerUserId);
          if (!pc) continue;
          const addedTrack = addTracksIfNeeded(pc, stream);
          const peerMedia = mediaByUser[peerUserId] || peer.media || {};
          const peerHasMediaOn = Boolean(peerMedia.micOn || peerMedia.cameraOn);
          if (!shouldCreateOffer(peerUserId) && peerHasMediaOn) continue;
          if (pc.signalingState !== "stable") continue;
          const hasRemoteDescription = Boolean(pc.currentRemoteDescription);
          if (!addedTrack && hasRemoteDescription) continue;
          makingOfferRef.current[peerUserId] = true;
          try {
            const offer = await pc.createOffer();
            if (pc.signalingState !== "stable") continue;
            await pc.setLocalDescription(offer);
            const offerId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            pendingOfferRef.current[peerUserId] = offerId;
            socket.emit("room-webrtc-offer", {
              roomCode,
              fromUserId: userId,
              targetUserId: peerUserId,
              sdp: pc.localDescription || offer,
              offerId
            });
          } finally {
            makingOfferRef.current[peerUserId] = false;
          }
        }
      } catch {}
    };

    connectPeers();
    return () => {
      cancelled = true;
    };
  }, [room?.roomCode, room?.players, userId, micOn, cameraOn, mediaByUser]);

  const createRoom = () => {
    setNote("");
    socket.emit("create-room", { userId, ...settings });
  };

  const joinRoom = () => {
    const roomCode = joinCode.trim().toUpperCase();
    if (!roomCode) return;
    setNote("");
    socket.emit("join-room", { roomCode, userId, language: settings.preferredLanguage });
  };

  const updateSettings = patch => {
    if (room?.status === "waiting" && !isAdmin) return;
    if (roomStartLocked) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    if (isAdmin && room?.status === "waiting") {
      socket.emit("room-update-settings", {
        roomCode: room.roomCode,
        userId,
        ...next
      });
    }
  };

  const toggleReady = () => {
    if (!room?.roomCode) return;
    if (roomStartLocked) return;
    socket.emit("toggle-ready", { roomCode: room.roomCode, userId });
  };

  const openStartPanel = () => {
    if (!isAdmin || !room?.roomCode || roomStartLocked) return;
    setStartingMatch(true);
    const customTopic = String(startTopicInput || "").trim();
    socket.emit("start-room-match", {
      roomCode: room.roomCode,
      userId,
      customTopic
    });
    setStartTopicInput("");
    setNote("");
  };

  const runCode = () => {
    if (!room?.roomCode) return;
    setNote("");
    setRunResult(null);
    setRunning(true);
    socket.emit("room-run", {
      roomCode: room.roomCode,
      userId,
      language: myPlayer?.language || settings.preferredLanguage,
      code
    });
  };

  const submitCode = () => {
    if (!room?.roomCode || submitted) return;
    setNote("");
    setSubmitted(true);
    socket.emit("room-submit", {
      roomCode: room.roomCode,
      userId,
      language: myPlayer?.language || settings.preferredLanguage,
      code
    });
  };

  const sendRoomMessage = () => {
    if (!msg.trim()) return;
    const roomCode = roomCodeRef.current || room?.roomCode;
    if (!roomCode) return;
    socket.emit("room-message", { roomCode, userId, text: msg.trim() });
    setMsg("");
  };

  const leaveRoom = () => {
    if (room?.roomCode) {
      socket.emit("room-leave", {
        roomCode: room.roomCode,
        userId,
        reason: "Player returned to home."
      });
    }
    closeAllPeers();
    stopLocalStream();
    setRoom(null);
    setQuestion(null);
    setResult(null);
    setMessages([]);
    setSubmitted(false);
    setStartingMatch(false);
    setStartTopicInput("");
    setRemoveCandidate(null);
    navigate("/home");
  };

  const sendInvite = targetUserId => {
    if (!isAdmin || !room?.roomCode) return;
    socket.emit("room-invite-send", {
      roomCode: room.roomCode,
      userId,
      targetUserId
    });
  };

  const inviteRespond = (inviteId, action) => {
    socket.emit("room-invite-respond", { inviteId, action, userId });
  };

  const removePlayerFromRoom = (targetUserId, targetName = "this player") => {
    if (!isAdmin || !room?.roomCode || !targetUserId) return;
    if (String(targetUserId) === String(userId)) return;
    setRemoveCandidate({
      targetUserId: String(targetUserId),
      targetName: String(targetName || "this player")
    });
  };

  const cancelRemoveCandidate = () => {
    setRemoveCandidate(null);
  };

  const confirmRemoveCandidate = () => {
    if (!isAdmin || !room?.roomCode || !removeCandidate?.targetUserId) return;
    socket.emit("room-remove-player", {
      roomCode: room.roomCode,
      userId,
      targetUserId: String(removeCandidate.targetUserId)
    });
    setNote(`Removing ${removeCandidate.targetName} from room...`);
    setRemoveCandidate(null);
  };

  const toggleMedia = async field => {
    const nextMic = field === "mic" ? !micOn : micOn;
    const nextCamera = field === "camera" ? !cameraOn : cameraOn;
    const shouldStartStream = nextMic || nextCamera;
    if (shouldStartStream && !localStreamRef.current) {
      try {
        await ensureLocalStream();
      } catch {
        return;
      }
    }
    if (field === "mic") setMicOn(prev => !prev);
    if (field === "camera") setCameraOn(prev => !prev);
  };

  const compareNow = () => {
    if (!room?.roomCode || !selectedUserId) return;
    const mine = rankedPlayers.find(player => String(player.userId) === String(userId));
    if (!mine) return;
    setCompareLoading(true);
    socket.emit("room-compare-request", {
      roomCode: room.roomCode,
      userAId: String(mine.userId),
      userBId: String(selectedUserId)
    });
  };

  const sendFriend = async targetId => {
    try {
      await API.post("/friends/send", { userId: targetId }, headers);
      setFriendMsg("Friend request sent.");
    } catch (err) {
      setFriendMsg(err.response?.data?.message || "Unable to send friend request.");
    }
  };

  const isUserOnline = candidateUserId =>
    (onlineUsers || []).some(entry => {
      if (entry === null || entry === undefined) return false;
      if (typeof entry === "string" || typeof entry === "number") {
        return String(entry) === String(candidateUserId);
      }
      const mappedId = entry.userId || entry._id || entry.id || "";
      return String(mappedId) === String(candidateUserId);
    });

  const resolveLiveMode = (mode, { inCurrentRoom = false, online = false, roomStatus = "waiting" } = {}) => {
    const normalizedMode = String(mode || "").trim();
    if (inCurrentRoom) {
      if (roomStatus === "coding") return "room_coding";
      if (roomStatus === "finished") return "room_post_match";
      return "room_waiting";
    }
    const offlineLike = normalizedMode === "offline" || normalizedMode.startsWith("offline");
    if (normalizedMode && !offlineLike) return normalizedMode;
    if (online) return "idle";
    return "offline";
  };

  const friendRows = useMemo(() => {
    const inRoom = new Set((room?.players || []).map(player => String(player.userId)));
    return friends.map(friend => {
      const rawMode = String(userModes[String(friend._id)]?.mode || "");
      const online = isUserOnline(friend._id);
      const inCurrentRoom = inRoom.has(String(friend._id));
      const mode = resolveLiveMode(rawMode, {
        inCurrentRoom,
        online,
        roomStatus: room?.status || "waiting"
      });
      return {
        ...friend,
        inRoom: inCurrentRoom,
        online: online || Boolean(mode && mode !== "offline") || inCurrentRoom,
        mode
      };
    });
  }, [friends, onlineUsers, userModes, room]);

  const renderChatMessages = () => (
    <div className="chat">
      {messages.map((message, idx) => {
        const isMine = String(message?.socketId || "") === String(socket.id || "")
          || String(message?.userId || "") === String(userId || "");
        return (
          <div key={`${message?.createdAt || "m"}-${idx}`} className={`chat-message ${isMine ? "mine" : "other"}`}>
            <p className="chat-meta">{isMine ? "You" : (message?.name || "User")}</p>
            <p className="chat-text">{message?.text || ""}</p>
          </div>
        );
      })}
    </div>
  );

  const mediaSection = room && (
    <div className="media-stack">
      <h4>Voice / Camera</h4>
      <div className="row">
        <button className="room-btn" onClick={() => toggleMedia("mic")}>Mic: {micOn ? "On" : "Off"}</button>
        <button className="room-btn" onClick={() => toggleMedia("camera")}>Camera: {cameraOn ? "On" : "Off"}</button>
      </div>
      {!!mediaError && <p className="note">{mediaError}</p>}
      <div className="video-grid">
        <div className="video-tile">
          {localStream && cameraOn ? (
            <video ref={localVideoRef} autoPlay playsInline muted />
          ) : (
            <div className="video-placeholder">You</div>
          )}
          <p>You | Mic {micOn ? "On" : "Off"} | Camera {cameraOn ? "On" : "Off"}</p>
        </div>
        {(room.players || [])
          .filter(player => String(player.userId) !== String(userId))
          .map(player => {
            const key = String(player.userId);
            const media = mediaByUser[key] || player.media || {};
            return (
              <RemoteMediaTile
                key={key}
                stream={remoteStreams[key] || null}
                name={player.name}
                micOn={Boolean(media.micOn)}
                cameraOn={Boolean(media.cameraOn)}
              />
            );
          })}
      </div>
    </div>
  );

  return (
    <div className="room-shell">
      <div className="room-page">
        <div className="room-head">
          <h2>Room Box</h2>
          <button className="room-btn ghost" onClick={leaveRoom}>Home</button>
        </div>

        {!!note && <p className="note">{note}</p>}
        {!!friendMsg && <p className="note">{friendMsg}</p>}

        {incomingInvites.map(invite => (
          <div className="invite-popup" key={invite.inviteId}>
            <p><strong>{invite.senderName}</strong> invited you to <strong>{invite.roomCode}</strong></p>
            <p>{invite.secondsLeft}s left</p>
            <div className="row">
              <button className="room-btn primary" onClick={() => inviteRespond(invite.inviteId, "accept")}>Accept</button>
              <button className="room-btn" onClick={() => inviteRespond(invite.inviteId, "decline")}>Cancel</button>
            </div>
          </div>
        ))}

        {!room && (
          <div className="grid two">
            <div className="card">
              <h3>Create</h3>
              <label>
                Set timer (minutes)
              </label>
              <input
                type="number"
                min="2"
                max="180"
                value={Math.max(2, Math.round(Number(settings.durationSeconds || 900) / 60))}
                onChange={e => {
                  const minutes = Math.max(2, Number(e.target.value) || 15);
                  updateSettings({ durationSeconds: minutes * 60 });
                }}
              />
              <label>
                <input
                  type="checkbox"
                  checked={settings.isCross}
                  onChange={e => updateSettings({ isCross: e.target.checked })}
                />
                {" "}
                Cross language
              </label>
              <button className="room-btn primary" onClick={createRoom}>Create Room</button>
            </div>

            <div className="card">
              <h3>Join</h3>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Room code" />
              <button className="room-btn primary" onClick={joinRoom}>Join Room</button>
            </div>
          </div>
        )}

        {room && room.status === "waiting" && (
          <div className="grid two">
            <div className="card">
              <h3>Room {room.roomCode}</h3>
              <p>Admin: {room.adminName || "Admin"}</p>

              {isAdmin && (
                <div className="admin-slot">
                  <h4>Admin Control Slot</h4>
                  <select
                    value={settings.difficulty}
                    onChange={e => updateSettings({ difficulty: e.target.value })}
                    disabled={roomStartLocked}
                  >
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                  <select
                    value={settings.type}
                    onChange={e => updateSettings({ type: e.target.value })}
                    disabled={roomStartLocked}
                  >
                    <option>DSA</option>
                    <option>Normal</option>
                  </select>
                  <label>
                    Set timer (minutes)
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="180"
                    value={Math.max(2, Math.round(Number(settings.durationSeconds || 900) / 60))}
                    disabled={roomStartLocked}
                    onChange={e => {
                      const minutes = Math.max(2, Number(e.target.value) || 15);
                      updateSettings({ durationSeconds: minutes * 60 });
                    }}
                  />
                  {roomStartLocked && (
                    <p className="note room-lock-note">Start confirmed. Room settings are locked.</p>
                  )}
                </div>
              )}

              {(room.players || []).map(player => (
                <div key={player.userId} className="player">
                  <span>{player.name} {player.isAdmin ? "(Admin)" : ""}</span>
                  <span>
                    {player.isReady ? "Ready" : "Not Ready"} | {
                      resolveLiveMode(player.liveMode, {
                        inCurrentRoom: true,
                        online: Boolean(player?.online),
                        roomStatus: room?.status || "waiting"
                      })
                    }
                  </span>
                  {isAdmin && !player.isAdmin && (
                    <button
                      className="room-btn danger"
                      disabled={roomStartLocked}
                      onClick={() => removePlayerFromRoom(player.userId, player.name || "this player")}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              {isAdmin && !!removeCandidate && !roomStartLocked && (
                <div className="start-panel">
                  <p>Remove <strong>{removeCandidate.targetName}</strong> from this room?</p>
                  <div className="row">
                    <button className="room-btn danger" onClick={confirmRemoveCandidate}>OK Remove</button>
                    <button className="room-btn" onClick={cancelRemoveCandidate}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="row">
                {!roomStartLocked && (
                  <button className="room-btn primary" onClick={toggleReady}>
                    {myPlayer?.isReady ? "Unready" : "Ready"}
                  </button>
                )}
                {roomStartLocked && !isAdmin && (
                  <p className="note room-lock-note">Admin confirmed start. Ready state is locked.</p>
                )}
                {isAdmin && !roomStartLocked && (
                  <button className="room-btn primary" onClick={openStartPanel}>Start Match</button>
                )}
              </div>
              {isAdmin && !roomStartLocked && (
                <div className="start-panel">
                  <p>Selected concept (optional). Leave empty for random question.</p>
                  <input
                    value={startTopicInput}
                    onChange={e => setStartTopicInput(e.target.value)}
                    placeholder="Example: sliding window / graphs / dp"
                  />
                </div>
              )}

              {isAdmin && startingMatch && (
                <p className="note">Starting match and generating question...</p>
              )}

              {mediaSection}
            </div>

            <div className="card">
              <h3>Invite Friends</h3>
              {friendRows.map(friend => (
                <div key={friend._id} className="player">
                  <span>{friend.name}</span>
                  <span>{friend.inRoom ? "In Room" : (friend.online ? `Online (${friend.mode})` : "Offline")}</span>
                  {!friend.inRoom && (
                    <button className="room-btn" disabled={!isAdmin} onClick={() => sendInvite(friend._id)}>
                      Invite
                    </button>
                  )}
                </div>
              ))}
              {Object.values(outgoingInvites).map(invite => (
                <p key={invite.inviteId}>
                  {invite.targetUserId}: {invite.status} {invite.secondsLeft ? `(${invite.secondsLeft}s)` : ""}
                </p>
              ))}

              <div className="section-divider" />
              <h4>Waiting Room Chat</h4>
              {renderChatMessages()}
              <div className="row">
                <input
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  placeholder="Type message"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendRoomMessage();
                    }
                  }}
                />
                <button className="room-btn" onClick={sendRoomMessage}>Send</button>
              </div>
            </div>
          </div>
        )}

        {room && room.status === "coding" && (
          <div className="grid three">
            <div className="card problem-card">
              <h3>{question?.title || "Problem"}</h3>
              <p className="problem-description">{question?.description}</p>

              {!!question?.narrative && (
                <div className="problem-section">
                  <h4>Story</h4>
                  <p>{question.narrative}</p>
                </div>
              )}

              {!!question?.problemStatement && (
                <div className="problem-section">
                  <h4>Problem Statement</h4>
                  <p>{question.problemStatement}</p>
                </div>
              )}

              {(question?.inputFormat || question?.outputFormat) && (
                <div className="problem-section">
                  {!!question?.inputFormat && <p><strong>Input:</strong> {question.inputFormat}</p>}
                  {!!question?.outputFormat && <p><strong>Output:</strong> {question.outputFormat}</p>}
                </div>
              )}

              {!!question?.examples?.length && (
                <div className="problem-section">
                  <h4>Examples</h4>
                  {question.examples.map((example, idx) => (
                    <div key={`ex-${idx}`} className="problem-example">
                      <p><strong>{example.title || `Example ${idx + 1}`}</strong></p>
                      <p><strong>Input:</strong> {example.inputText}</p>
                      <p><strong>Output:</strong> {example.outputText}</p>
                      {!!example.explanation && <p><strong>Explanation:</strong> {example.explanation}</p>}
                    </div>
                  ))}
                </div>
              )}

              {!!question?.constraints?.length && (
                <div className="problem-section">
                  <h4>Constraints</h4>
                  <ul className="problem-list">
                    {question.constraints.map((item, idx) => <li key={`const-${idx}`}>{item}</li>)}
                  </ul>
                </div>
              )}

              {!!question?.topics?.length && (
                <div className="problem-section">
                  <h4>Topics</h4>
                  <div className="problem-tags">
                    {question.topics.map((topic, idx) => <span key={`topic-${idx}`}>{topic}</span>)}
                  </div>
                </div>
              )}

              {!!question?.companies?.length && (
                <div className="problem-section">
                  <h4>Companies</h4>
                  <div className="problem-tags">
                    {question.companies.map((company, idx) => <span key={`company-${idx}`}>{company}</span>)}
                  </div>
                </div>
              )}

              {!!question?.sampleTestCases?.length && (
                <div className="problem-section">
                  <h4>Sample Test Cases</h4>
                  {question.sampleTestCases.map((tc, idx) => (
                    <div key={`sample-${idx}`} className="problem-example">
                      <p><strong>Sample {idx + 1}</strong></p>
                      <p><strong>Input:</strong></p>
                      <pre>{renderObject(tc.input)}</pre>
                      <p><strong>Output:</strong></p>
                      <pre>{renderObject(tc.output)}</pre>
                    </div>
                  ))}
                </div>
              )}

              {!!question?.hint && (
                <div className="problem-section">
                  <h4>Hint</h4>
                  <p>{question.hint}</p>
                </div>
              )}

              {!!question?.followUp && (
                <div className="problem-section">
                  <h4>Follow-up</h4>
                  <p>{question.followUp}</p>
                </div>
              )}

              <p className="problem-stat">Time left: <strong>{remaining}s</strong></p>
              <p className="problem-stat">Submitted: {submission.submittedCount}/{submission.totalPlayers}</p>
            </div>

            <div className="card">
              {!submitted && <textarea rows={14} value={code} onChange={e => setCode(e.target.value)} />}
              {submitted && <p>Submitted. Waiting for room completion...</p>}
              <div className="row">
                <button className="room-btn" onClick={runCode} disabled={running}>{running ? "Running..." : "Run"}</button>
                <button className="room-btn primary" onClick={submitCode} disabled={submitted}>Submit</button>
              </div>
              {!!runResult && (
                <div className="run-result-block">
                  <p><strong>Run Status:</strong> {runResult.compilerMessage || "Unknown"}</p>
                  {!!runResult?.message && (
                    <div className="run-error-block">
                      <p><strong>Error Section:</strong> Runtime / Compile Error</p>
                      <p>{runResult.message}</p>
                    </div>
                  )}
                  {!runResult?.message && Number(runResult.totalCases || 0) > 0 && (
                    <>
                      <p><strong>Sample Passed/Total:</strong> {runResult.samplePassedCount || 0}/{runResult.sampleTotal || 0}</p>
                      <p><strong>Hidden Passed/Total:</strong> {runResult.hiddenPassedCount || 0}/{runResult.hiddenTotal || 0}</p>
                      <p><strong>Total Passed/Total:</strong> {runResult.totalPassed || 0}/{runResult.totalCases || 0}</p>
                      <p><strong>Total Pass %:</strong> {runResult.totalPassPercentage ?? 0}%</p>
                      {!!runResult.judgeNote && <p><strong>Judge Note:</strong> {runResult.judgeNote}</p>}
                      <p><strong>Time Complexity:</strong> {runResult.timeComplexity || "Unknown"}</p>
                      <p><strong>Space Complexity:</strong> {runResult.spaceComplexity || "Unknown"}</p>
                      <p><strong>Efficiency:</strong> {runResult.efficiencyScore ?? 0}</p>
                    </>
                  )}
                  {(runResult?.errorSection?.message || runResult?.runtimeError?.hasError) && !runResult?.message && (
                    <div className="run-error-block">
                      <p><strong>Error Section:</strong> {runResult?.errorSection?.title || "Runtime / Compile Error"}</p>
                      {!!runResult?.errorSection?.message && <p>{runResult.errorSection.message}</p>}
                      {!!runResult?.runtimeError?.hasError && <p>{runResult.runtimeError.message}</p>}
                    </div>
                  )}
                </div>
              )}
              {mediaSection}
            </div>

            <div className="card">
              <h4>Chat</h4>
              {renderChatMessages()}
              <div className="row">
                <input
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  placeholder="Type message"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendRoomMessage();
                    }
                  }}
                />
                <button className="room-btn" onClick={sendRoomMessage}>Send</button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="grid three">
              <div className="card">
                <h3>Rankings</h3>
                {rankedPlayers.map(player => (
                  <button
                    key={player.userId}
                    className={`rank ${String(selectedUserId) === String(player.userId) ? "active" : ""}`}
                    onClick={() => setSelectedUserId(String(player.userId))}
                  >
                    #{player.rank} {player.name} - {player.compilerMessage}
                  </button>
                ))}
              </div>

              <div className="card">
                <h3>Code & Metrics</h3>
                {selected && (
                  <>
                    <p>{selected.name} | {selected.timeComplexity} | {selected.spaceComplexity}</p>
                    <pre className="code">{selected.code || "No submission"}</pre>
                    {String(selected.userId) !== String(userId) && (
                      <div className="row">
                        <button className="room-btn primary" onClick={compareNow}>Compare</button>
                        <button className="room-btn" onClick={() => sendFriend(selected.userId)}>Send Friend Request</button>
                      </div>
                    )}
                  </>
                )}
                {compareLoading && <p>Comparing...</p>}
                {compareRes?.compare && (
                  <div>
                    <p><strong>Summary:</strong> {compareRes.compare.summary}</p>
                    <p><strong>Key Difference:</strong> {compareRes.compare.keyDifference}</p>
                    <p><strong>Why Winner Won:</strong> {compareRes.compare.whyWinnerWon}</p>
                    <p><strong>User Mistake:</strong> {compareRes.compare.userMistake}</p>
                    <p><strong>Improvement Tip:</strong> {compareRes.compare.improvementTip}</p>
                  </div>
                )}
              </div>

              <div className="card">
                <h4>Post-match Chat</h4>
                {renderChatMessages()}
                <div className="row">
                  <input
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                    placeholder="Type message"
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendRoomMessage();
                      }
                    }}
                  />
                  <button className="room-btn" onClick={sendRoomMessage}>Send</button>
                </div>
              </div>
            </div>
            {mediaSection}
          </>
        )}
      </div>
    </div>
  );
}

export default RoomBox;
