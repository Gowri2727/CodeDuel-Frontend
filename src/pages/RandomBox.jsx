import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import {
  buildRoomAutoJoinPath,
  clearPendingRoomAutoJoin,
  getPendingRoomAutoJoin,
  setPendingRoomAutoJoin
} from "../utils/roomInviteAutoJoin";
import "../styles/random-box.css";

function getParamNamesFromQuestion(question) {
  const sampleInput = question?.sampleTestCases?.[0]?.input;
  if (!sampleInput || typeof sampleInput !== "object" || Array.isArray(sampleInput)) {
    return ["data"];
  }
  const keys = Object.keys(sampleInput).filter(Boolean);
  return keys.length ? keys : ["data"];
}

function getDynamicStarterCode(language, question) {
  const paramNames = getParamNamesFromQuestion(question);
  const params = paramNames.join(", ");
  const firstParam = paramNames[0] || "data";
  const lang = String(language || "python").toLowerCase();

  if (lang.includes("python")) {
    return `class Solution:\n    def solve(self, ${params}):\n        # Write your logic here\n        pass\n`;
  }
  if (lang.includes("java")) {
    return `class Solution {\n    public Object solve(Object ${firstParam}) {\n        // Write your logic here\n        return null;\n    }\n}\n`;
  }
  if (lang.includes("javascript") || lang === "js") {
    return `class Solution {\n  solve(${params}) {\n    // Write your logic here\n  }\n}\n`;
  }
  if (lang.includes("c++") || lang.includes("cpp")) {
    return `class Solution {\n  public:\n    void solve() {\n      // Write your logic here\n    }\n};\n`;
  }
  if (lang === "c") {
    return `void solve() {\n  // Write your logic here\n}\n`;
  }
  return "// Write your logic here\n";
}

function toFlowSteps(flowText) {
  const raw = String(flowText || "").trim();
  if (!raw) return [];

  return raw
    .split(/\n|\. |; /)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function RandomBox() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const [languages, setLanguages] = useState([]);
  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState("Easy");
  const [type, setType] = useState("DSA");
  const [isCross, setIsCross] = useState(false);

  const [waiting, setWaiting] = useState(false);
  const [waitCountdown, setWaitCountdown] = useState(40);
  const [queueMessage, setQueueMessage] = useState("");

  const [roomId, setRoomId] = useState("");
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);

  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState({
    submittedCount: 0,
    totalPlayers: 2,
    submittedUserIds: []
  });
  const [submissionCountdown, setSubmissionCountdown] = useState({
    active: false,
    secondsLeft: 0,
    waitingUserIds: []
  });

  const [result, setResult] = useState(null);
  const [showOpponentCode, setShowOpponentCode] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");
  const [friendStatus, setFriendStatus] = useState("");
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [rejoinState, setRejoinState] = useState({
    active: false,
    message: ""
  });
  const roomIdRef = useRef("");
  const languageRef = useRef("");
  const resultRef = useRef(null);
  const runTimerRef = useRef(null);

  const currentUserResult = useMemo(
    () =>
      result?.results?.find(r => r.participantId === socket.id) ||
      result?.results?.find(r => String(r.userId) === String(userId)) ||
      null,
    [result, userId]
  );

  const opponentResult = useMemo(
    () =>
      result?.results?.find(r => r.participantId && r.participantId !== socket.id) ||
      result?.results?.find(r => String(r.userId) !== String(userId)) ||
      null,
    [result, userId]
  );

  const opponentCode = useMemo(
    () =>
      result?.codes?.find(c => c.participantId && c.participantId !== socket.id) ||
      result?.codes?.find(c => String(c.userId) !== String(userId)) ||
      null,
    [result, userId]
  );

  const outcome = useMemo(() => {
    if (!result) return null;

    const winnerId = String(result.winnerId || "");
    const me = String(currentUserResult?.userId || userId || "");
    const isDraw = !winnerId || winnerId === "null" || String(result.status || "").toLowerCase().includes("draw");

    if (isDraw) {
      return {
        kind: "draw",
        title: "Match Draw",
        subtitle: "Both players are tied."
      };
    }

    if (winnerId === me) {
      return {
        kind: "win",
        title: "You Win",
        subtitle: "Opponent: You Lose"
      };
    }

    return {
      kind: "lose",
      title: "You Lose",
      subtitle: "Opponent: You Win"
    };
  }, [result, currentUserResult, userId]);

  const yourFlowText = useMemo(() => {
    if (!result?.compare) return "";
    return String(result.compare?.userAUserId) === String(userId)
      ? result.compare?.userAFlow
      : result.compare?.userBFlow;
  }, [result, userId]);

  const opponentFlowText = useMemo(() => {
    if (!result?.compare) return "";
    return String(result.compare?.userAUserId) === String(userId)
      ? result.compare?.userBFlow
      : result.compare?.userAFlow;
  }, [result, userId]);

  const yourFlowSteps = useMemo(() => toFlowSteps(yourFlowText), [yourFlowText]);
  const opponentFlowSteps = useMemo(() => toFlowSteps(opponentFlowText), [opponentFlowText]);

  const playerNameByUserId = useMemo(() => {
    const map = new Map();
    (players || []).forEach(p => map.set(String(p.userId), p.name || "User"));
    return map;
  }, [players]);

  const isCurrentUserSubmitted = useMemo(
    () => (submissionStatus.submittedUserIds || []).some(id => String(id) === String(userId)),
    [submissionStatus, userId]
  );
  const isRandomBusy = waiting || Boolean(question && !result);
  const randomMode = waiting
    ? "random_queue"
    : (question && !result ? "random_coding" : "idle");

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    if (!userId) return undefined;
    socket.emit("user-set-mode", { userId, mode: randomMode });
    return () => {
      socket.emit("user-clear-mode", { userId });
    };
  }, [randomMode, userId]);

  useEffect(() => {
    const onInviteReceived = payload => {
      if (!payload?.inviteId || !payload?.roomCode) return;
      setIncomingInvites(prev => [
        ...prev.filter(item => item.inviteId !== payload.inviteId),
        {
          ...payload,
          secondsLeft: Math.max(
            Math.ceil((new Date(payload.expiresAt).getTime() - Date.now()) / 1000),
            0
          )
        }
      ]);
    };

    const onInviteStatus = payload => {
      if (!payload?.inviteId) return;

      const pending = getPendingRoomAutoJoin();
      if (pending?.inviteId === payload.inviteId) {
        if (String(payload.status || "") === "accepted" && payload?.roomCode && !isRandomBusy) {
          clearPendingRoomAutoJoin();
          navigate(buildRoomAutoJoinPath(payload.roomCode));
        }

        if (["declined", "expired", "error"].includes(String(payload.status || ""))) {
          clearPendingRoomAutoJoin();
        }
      }

      setIncomingInvites(prev => prev.filter(item => item.inviteId !== payload.inviteId));
    };

    socket.on("room-invite-received", onInviteReceived);
    socket.on("room-invite-status", onInviteStatus);

    return () => {
      socket.off("room-invite-received", onInviteReceived);
      socket.off("room-invite-status", onInviteStatus);
    };
  }, [isRandomBusy, navigate]);

  useEffect(() => {
    if (!incomingInvites.length) return undefined;

    const id = setInterval(() => {
      setIncomingInvites(prev =>
        prev
          .map(item => ({
            ...item,
            secondsLeft: Math.max(
              Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 1000),
              0
            )
          }))
          .filter(item => item.secondsLeft > 0)
      );
    }, 1000);

    return () => clearInterval(id);
  }, [incomingInvites.length]);

  useEffect(() => {
    if (isRandomBusy) return;
    const pending = getPendingRoomAutoJoin();
    if (!pending?.roomCode) return;
    clearPendingRoomAutoJoin();
    navigate(buildRoomAutoJoinPath(pending.roomCode));
  }, [isRandomBusy, navigate]);

  useEffect(() => {
    const notice = sessionStorage.getItem("random_forfeit_notice");
    if (notice) {
      setQueueMessage(notice);
      sessionStorage.removeItem("random_forfeit_notice");
    }
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (roomIdRef.current && !resultRef.current) {
        sessionStorage.setItem(
          "random_forfeit_notice",
          "You left an active duel. It is counted as a forfeit loss."
        );
        socket.emit("random-leave-match", {
          roomId: roomIdRef.current,
          userId,
          reason: "Opponent disconnected. Match ended."
        });
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [userId]);

  useEffect(() => {
    API.get("/users/me", headers)
      .then(res => {
        setLanguages(res.data.languages || []);
        setLanguage(res.data.languages?.[0] || "");
      })
      .catch(() => {
        setQueueMessage("Failed to load profile languages.");
      });
  }, []);

  useEffect(() => {
    if (!waiting) return;

    const timer = setInterval(() => {
      setWaitCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    const handleSocketConnect = () => {
      if (userId) {
        socket.emit("user-online", userId);
      }
      if (roomIdRef.current) {
        socket.emit("random-rejoin", {
          roomId: roomIdRef.current,
          userId
        });
      }
    };

    socket.on("connect", handleSocketConnect);

    socket.on("match-searching", data => {
      const timeoutSeconds = Number(data?.timeoutSeconds);
      setWaiting(true);
      setWaitCountdown(Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : 40);
      setQueueMessage("Searching for a compatible opponent...");
      setRejoinState({ active: false, message: "" });
    });

    socket.on("match-timeout", data => {
      setWaiting(false);
      setQueueMessage(data?.message || "No opponent found.");
      setTimeout(() => navigate(data?.redirectPath || "/home"), 1200);
    });

    socket.on("match-found", data => {
      setWaiting(false);
      setQueueMessage("");
      setRoomId(data.roomId);
      setPlayers(data.players || []);
      setQuestion(data.question);
      setCode(data?.question?.starterCode || getDynamicStarterCode(languageRef.current, data?.question));
      setSubmitted(false);
      setRunResult(null);
      setSubmissionStatus({
        submittedCount: 0,
        totalPlayers: (data.players || []).length || 2,
        submittedUserIds: []
      });
      setSubmissionCountdown({ active: false, secondsLeft: 0, waitingUserIds: [] });
      setResult(null);
      setFriendStatus("");
      setMessages([]);
      setRejoinState({ active: false, message: "" });
    });

    socket.on("random-submission-update", data => {
      setSubmissionStatus({
        submittedCount: Number(data?.submittedCount || 0),
        totalPlayers: Number(data?.totalPlayers || 2),
        submittedUserIds: Array.isArray(data?.submittedUserIds) ? data.submittedUserIds : []
      });
    });

    socket.on("random-submission-countdown", data => {
      setSubmissionCountdown({
        active: Boolean(data?.active),
        secondsLeft: Number(data?.secondsLeft || 0),
        waitingUserIds: Array.isArray(data?.waitingUserIds) ? data.waitingUserIds : []
      });
    });

    socket.on("random-result", data => {
      setResult(data);
      setSubmitted(true);
      setRunning(false);
      setSubmissionCountdown({ active: false, secondsLeft: 0, waitingUserIds: [] });
      if (roomIdRef.current) {
        socket.emit("random-rejoin", {
          roomId: roomIdRef.current,
          userId
        });
      }
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
      setRejoinState({
        active: true,
        message: "Result announced. Chat is still active for both users."
      });
    });

    socket.on("random-message", data => {
      setMessages(prev => [...prev, data]);
    });

    socket.on("random-chat-sync", data => {
      const synced = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(synced);
    });

    socket.on("random-rejoin-ack", data => {
      if (!data?.ok) {
        setRejoinState({
          active: true,
          message: data?.message || "Unable to rejoin match chat."
        });
      } else if (resultRef.current) {
        setRejoinState({
          active: true,
          message: "Connected to post-result chat."
        });
      }
    });

    socket.on("random-submit-ack", data => {
      setSubmitted(Boolean(data?.submitted));
      setSubmissionStatus({
        submittedCount: Number(data?.submittedCount || 0),
        totalPlayers: Number(data?.totalPlayers || 2),
        submittedUserIds: Array.isArray(data?.submittedUserIds) ? data.submittedUserIds : []
      });
    });

    socket.on("random-submit-error", data => {
      setSubmitted(false);
      setQueueMessage(data?.message || "Submission failed. Please retry.");
    });

    socket.on("random-run-result", data => {
      setRunResult(data);
      setRunning(false);
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
    });

    socket.on("random-opponent-left", data => {
      setQueueMessage(data?.message || "Opponent left the match.");
      setSubmitted(false);
      setRunning(false);
      setSubmissionCountdown({ active: false, secondsLeft: 0, waitingUserIds: [] });
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
    });

    return () => {
      socket.off("connect", handleSocketConnect);
      socket.off("match-searching");
      socket.off("match-timeout");
      socket.off("match-found");
      socket.off("random-submission-update");
      socket.off("random-submission-countdown");
      socket.off("random-result");
      socket.off("random-message");
      socket.off("random-chat-sync");
      socket.off("random-rejoin-ack");
      socket.off("random-submit-ack");
      socket.off("random-submit-error");
      socket.off("random-run-result");
      socket.off("random-opponent-left");
      if (roomIdRef.current) {
        socket.emit("random-leave-match", { roomId: roomIdRef.current, userId });
      }
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
      socket.emit("cancel-random-match");
    };
  }, [navigate, userId]);

  const findOpponent = () => {
    setQueueMessage("");
    setWaiting(true);
    setWaitCountdown(40);
    setRejoinState({ active: false, message: "" });
    socket.emit("find-random-match", {
      userId,
      language,
      difficulty,
      type,
      isCross
    });
  };

  const submitCode = () => {
    setQueueMessage("");
    setSubmitted(true);
    socket.emit("random-submit", {
      roomId,
      code,
      language
    });
  };

  const runCode = () => {
    setRunning(true);
    setQueueMessage("");
    setRunResult(null);
    if (runTimerRef.current) {
      clearTimeout(runTimerRef.current);
    }
    runTimerRef.current = setTimeout(() => {
      setRunning(false);
      setRunResult({
        compilerMessage: "Run Timed Out",
        samplePassed: false,
        samplePassedCount: 0,
        sampleTotal: 2,
        sampleFailedCount: 2,
        samplePassPercentage: 0,
        hiddenPassedCount: 0,
        hiddenTotal: 7,
        hiddenFailedCount: 7,
        hiddenPassPercentage: 0,
        totalPassed: 0,
        totalCases: 9,
        totalPassPercentage: 0,
        timeComplexity: "Unknown",
        spaceComplexity: "Unknown",
        efficiencyScore: 0,
        runtimeError: {
          hasError: true,
          message: "Run request timed out. Please retry."
        }
      });
    }, 45000);

    socket.emit("random-run", {
      roomId,
      code,
      language
    });
  };

  const sendMessage = () => {
    if (!msg.trim()) return;
    const activeRoomId = roomIdRef.current || roomId;
    if (!activeRoomId) return;
    socket.emit("random-message", {
      roomId: activeRoomId,
      userId,
      text: msg
    });
    setMsg("");
  };

  const sendFriendRequest = async () => {
    const opponentId = opponentResult?.userId;
    if (!opponentId) return;

    try {
      await API.post("/friends/send", { userId: opponentId }, headers);
      setFriendStatus("Friend request sent.");
    } catch (err) {
      setFriendStatus(err.response?.data?.message || "Unable to send friend request.");
    }
  };

  const goHomeOrAutoJoinInvitedRoom = () => {
    const pending = getPendingRoomAutoJoin();
    if (pending?.roomCode) {
      clearPendingRoomAutoJoin();
      navigate(buildRoomAutoJoinPath(pending.roomCode));
      return;
    }
    navigate("/home");
  };

  const respondInvite = (invite, action) => {
    if (!invite?.inviteId || !userId) return;

    socket.emit("room-invite-respond", {
      inviteId: invite.inviteId,
      action,
      userId
    });

    if (action === "accept" && invite?.roomCode) {
      setPendingRoomAutoJoin({
        roomCode: invite.roomCode,
        inviteId: invite.inviteId,
        acceptedAt: Date.now(),
        acceptedWhileMode: randomMode
      });

      if (isRandomBusy) {
        setQueueMessage(`Invite accepted. Auto-joining room ${invite.roomCode} when this duel ends.`);
      } else {
        clearPendingRoomAutoJoin();
        navigate(buildRoomAutoJoinPath(invite.roomCode));
      }
    }

    setIncomingInvites(prev => prev.filter(item => item.inviteId !== invite.inviteId));
  };

  return (
    <div className="random-shell">
      {incomingInvites.map(invite => (
        <div className="random-invite-popup" key={invite.inviteId}>
          <p><strong>{invite.senderName || "Room Admin"}</strong> invited you to <strong>{invite.roomCode}</strong></p>
          <p>{invite.secondsLeft}s left</p>
          <div className="random-invite-actions">
            <button className="random-primary" onClick={() => respondInvite(invite, "accept")}>Accept</button>
            <button className="random-secondary" onClick={() => respondInvite(invite, "decline")}>Cancel</button>
          </div>
        </div>
      ))}
      <div className="random-card">
        <div className="random-header">
          <h2>Random Box</h2>
          <p>Real-time matchmaking, live chat, fair question, and side-by-side result analysis.</p>
        </div>

        {!question && !waiting && (
          <div className="random-config">
            <div className="random-grid">
              <label>
                <span>Language</span>
                <select value={language} onChange={e => setLanguage(e.target.value)}>
                  {languages.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Difficulty</span>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </label>

              <label>
                <span>Type</span>
                <select value={type} onChange={e => setType(e.target.value)}>
                  <option>DSA</option>
                  <option>Normal</option>
                </select>
              </label>
            </div>

            <label className="random-checkbox">
              <input
                type="checkbox"
                checked={isCross}
                onChange={e => setIsCross(e.target.checked)}
              />
              <span>Cross Language Match</span>
            </label>

            <div className="random-action-row">
              <button className="random-primary" onClick={findOpponent}>Find Opponent</button>
              <button className="random-secondary" onClick={goHomeOrAutoJoinInvitedRoom}>Back Home</button>
            </div>
          </div>
        )}

        {waiting && (
          <div className="random-wait-card">
            <h3>Searching for opponent...</h3>
            <p>Queue timeout in: <strong>{waitCountdown}s</strong></p>
            <button
              className="random-secondary"
              onClick={() => {
                socket.emit("cancel-random-match");
                setWaiting(false);
                goHomeOrAutoJoinInvitedRoom();
              }}
            >
              Cancel and Go Home
            </button>
          </div>
        )}

        {!!queueMessage && <p className="random-note">{queueMessage}</p>}
        {rejoinState.active && <p className="random-note">{rejoinState.message}</p>}

        {question && (
          <div className="random-workspace">
            <div className="random-left-pane">
              <div className="random-problem-head">
                <h3>{question.title}</h3>
                {!!players?.length && <p>{players.map(p => p.name).join(" vs ")}</p>}
              </div>
              <p className="random-description">{question.description}</p>

              {!!question.narrative && (
                <div className="random-subpanel">
                  <h4>Story</h4>
                  <p>{question.narrative}</p>
                </div>
              )}

              {!!question.problemStatement && (
                <div className="random-subpanel">
                  <h4>Problem Statement</h4>
                  <p>{question.problemStatement}</p>
                </div>
              )}

              {(question.inputFormat || question.outputFormat) && (
                <div className="random-subpanel">
                  {!!question.inputFormat && <p><strong>Input Format:</strong> {question.inputFormat}</p>}
                  {!!question.outputFormat && <p><strong>Output Format:</strong> {question.outputFormat}</p>}
                </div>
              )}

              {!!question.examples?.length && (
                <div className="random-subpanel">
                  <h4>Examples</h4>
                  {question.examples.map((ex, idx) => (
                    <div key={idx} style={{ marginBottom: 10 }}>
                      <p><strong>{ex.title || `Example ${idx + 1}`}</strong></p>
                      <p><strong>Input:</strong> {ex.inputText}</p>
                      <p><strong>Output:</strong> {ex.outputText}</p>
                      {!!ex.explanation && <p><strong>Explanation:</strong> {ex.explanation}</p>}
                    </div>
                  ))}
                </div>
              )}

              {!!question.constraints?.length && (
                <div className="random-subpanel">
                  <h4>Constraints</h4>
                  <ul>
                    {question.constraints.map((item, idx) => <li key={idx}>{item}</li>)}
                  </ul>
                </div>
              )}

              {!!question.hint && (
                <div className="random-subpanel">
                  <h4>Hint</h4>
                  <p>{question.hint}</p>
                </div>
              )}

              {!!roomId && <p className="random-note">Room: {roomId}</p>}

              {result && (
                <div className="random-panel">
                  {!!outcome && (
                    <div className={`random-outcome random-outcome-${outcome.kind}`}>
                      <h3>{outcome.title}</h3>
                      <p>{outcome.subtitle}</p>
                    </div>
                  )}
                  <p><strong>Match Status:</strong> {result.status}</p>
                  <p><strong>Winner:</strong> {result.winnerName || "Draw"}</p>
                  {Number.isFinite(Number(result.awardedPoints)) && Number(result.awardedPoints) > 0 && (
                    <p><strong>Points Earned:</strong> +{result.awardedPoints} (Total: {result.totalPoints ?? "updated"})</p>
                  )}

                  {!!currentUserResult && (
                    <div className="random-mini-grid">
                      <p><strong>Your Result:</strong> {currentUserResult.compilerMessage}</p>
                      {!!Number.isFinite(Number(currentUserResult.hiddenTotal)) && (
                        <p><strong>Your Hidden Cases:</strong> {currentUserResult.hiddenPassed || 0}/{currentUserResult.hiddenTotal || 0}</p>
                      )}
                      <p><strong>Your Time:</strong> {currentUserResult.timeComplexity}</p>
                      <p><strong>Your Space:</strong> {currentUserResult.spaceComplexity}</p>
                      <p><strong>Your Efficiency:</strong> {currentUserResult.efficiencyScore}</p>
                    </div>
                  )}

                  {!!opponentResult && (
                    <p><strong>Opponent:</strong> {opponentResult.name} ({opponentResult.compilerMessage})</p>
                  )}

                  <div className="random-action-row">
                    <button
                      className="random-secondary"
                      onClick={() => setCode(question?.starterCode || getDynamicStarterCode(language, question))}
                    >
                      Reset Code
                    </button>
                    <button className="random-secondary" onClick={runCode} disabled={running}>
                      {running ? "Running..." : "Run"}
                    </button>
                    <button className="random-secondary" onClick={() => setShowOpponentCode(prev => !prev)}>
                      {showOpponentCode ? "Hide Opponent Code" : "View Opponent Code"}
                    </button>
                    <button className="random-secondary" onClick={() => setShowCompare(prev => !prev)}>
                      {showCompare ? "Hide Compare" : "Compare Code"}
                    </button>
                    <button className="random-secondary" onClick={sendFriendRequest}>Send Friend Request</button>
                    <button
                      className="random-primary"
                      onClick={() => {
                        socket.emit("random-leave-match", {
                          roomId,
                          userId,
                          reason: "Opponent exited the duel. Match closed."
                        });
                        goHomeOrAutoJoinInvitedRoom();
                      }}
                    >
                      Home
                    </button>
                  </div>

                  {!!friendStatus && <p className="random-note">{friendStatus}</p>}

                  {showOpponentCode && !!opponentCode && (
                    <div className="random-subpanel">
                      <h4>Opponent Code ({opponentCode.name})</h4>
                      <pre>{opponentCode.code}</pre>
                    </div>
                  )}

                  {showCompare && (
                    <div className="random-subpanel">
                      <h4>AI Compare</h4>
                      <p><strong>Summary:</strong> {result.compare?.summary}</p>
                      {!!result.compare?.keyDifference && (
                        <p><strong>Key Difference:</strong> {result.compare?.keyDifference}</p>
                      )}
                      {!!result.compare?.whyWinnerWon && (
                        <p><strong>Why Winner Won:</strong> {result.compare?.whyWinnerWon}</p>
                      )}
                      {!!result.compare?.userMistake && (
                        <p><strong>User Mistake:</strong> {result.compare?.userMistake}</p>
                      )}
                      {!!result.compare?.improvementTip && (
                        <p><strong>Improvement Tip:</strong> {result.compare?.improvementTip}</p>
                      )}
                      <div className="random-flow-grid">
                        <div className="random-flow-card">
                          <h5>Your Code Flow Chart</h5>
                          {yourFlowSteps.length > 0 ? (
                            yourFlowSteps.map((step, index) => (
                              <p key={`your-step-${index}`}>
                                <strong>Step {index + 1}:</strong> {step}
                              </p>
                            ))
                          ) : (
                            <p>{yourFlowText || "No flow details available."}</p>
                          )}
                        </div>
                        <div className="random-flow-card">
                          <h5>Opponent Code Flow Chart</h5>
                          {opponentFlowSteps.length > 0 ? (
                            opponentFlowSteps.map((step, index) => (
                              <p key={`opp-step-${index}`}>
                                <strong>Step {index + 1}:</strong> {step}
                              </p>
                            ))
                          ) : (
                            <p>{opponentFlowText || "No flow details available."}</p>
                          )}
                        </div>
                      </div>
                      <p>
                        <strong>Your Improvements:</strong>{" "}
                        {(
                          String(result.compare?.userAUserId) === String(userId)
                            ? result.compare?.userAImprovements
                            : result.compare?.userBImprovements
                        )?.join(" | ")}
                      </p>
                      <p>
                        <strong>Opponent Improvements:</strong>{" "}
                        {(
                          String(result.compare?.userAUserId) === String(userId)
                            ? result.compare?.userBImprovements
                            : result.compare?.userAImprovements
                        )?.join(" | ")}
                      </p>
                      <p><strong>Winner Reason:</strong> {result.compare?.winnerReason}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="random-right-pane">
              {!submitted && !result && (
                <>
                  <textarea
                    rows="16"
                    placeholder="Write ONLY the logic here"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                  />
                  <div className="random-action-row">
                    <button className="random-secondary" onClick={runCode} disabled={running}>
                      {running ? "Running..." : "Run"}
                    </button>
                    <button className="random-primary" onClick={submitCode}>Submit</button>
                  </div>
                  {submissionCountdown.active && !isCurrentUserSubmitted && (
                    <div className="random-panel">
                      <p><strong>Submission Deadline:</strong> {submissionCountdown.secondsLeft}s</p>
                      <p>Submit within the countdown, or you lose by submission timeout.</p>
                    </div>
                  )}
                  {submissionCountdown.active && isCurrentUserSubmitted && (
                    <div className="random-panel">
                      <p><strong>Waiting for opponent submission:</strong> {submissionCountdown.secondsLeft}s left</p>
                    </div>
                  )}
                </>
              )}

              {!!runResult && !result && (
                <div className="random-panel">
                  <p><strong>Run Status:</strong> {runResult.compilerMessage}</p>
                  {!!runResult.message && <p><strong>Message:</strong> {runResult.message}</p>}
                  {!!runResult.message && (
                    <div className="random-error-section">
                      <p><strong>Error Section:</strong> Runtime / Compile Error</p>
                      <p>{runResult.message}</p>
                    </div>
                  )}
                  {!runResult.message && (
                    <>
                  {!!runResult.sampleIgnored && <p><strong>Judge Note:</strong> {runResult.judgeNote}</p>}
                  {!runResult.sampleIgnored && (
                    <>
                      <p><strong>Sample Passed:</strong> {runResult.samplePassed ? "Yes" : "No"}</p>
                      <p><strong>Sample Passed/Total:</strong> {runResult.samplePassedCount || 0}/{runResult.sampleTotal || 0}</p>
                      <p><strong>Failed Samples:</strong> {runResult.sampleFailedCount || 0}</p>
                      <p><strong>Sample Pass %:</strong> {runResult.samplePassPercentage ?? 0}%</p>
                    </>
                  )}
                  <p><strong>Hidden Passed/Total:</strong> {runResult.hiddenPassedCount || 0}/{runResult.hiddenTotal || 0}</p>
                  <p><strong>Hidden Failed:</strong> {runResult.hiddenFailedCount || 0}</p>
                  <p><strong>Hidden Pass %:</strong> {runResult.hiddenPassPercentage ?? 0}%</p>
                  <p><strong>Total Passed/Total:</strong> {runResult.totalPassed || 0}/{runResult.totalCases || 0}</p>
                  <p><strong>Total Pass %:</strong> {runResult.totalPassPercentage ?? 0}%</p>
                  <p><strong>Time Complexity:</strong> {runResult.timeComplexity || "Unknown"}</p>
                  <p><strong>Space Complexity:</strong> {runResult.spaceComplexity || "Unknown"}</p>
                  <p><strong>Efficiency Score:</strong> {runResult.efficiencyScore ?? 0}</p>
                  {!!runResult.runtimeError?.hasError && (
                    <p><strong>Runtime:</strong> {runResult.runtimeError.message}</p>
                  )}
                  {(runResult?.errorSection?.message || runResult?.runtimeError?.hasError) && (
                    <div className="random-error-section">
                      <p><strong>Error Section:</strong> {runResult?.errorSection?.title || "Runtime / Compile Error"}</p>
                      {!!runResult?.errorSection?.message && <p>{runResult.errorSection.message}</p>}
                    </div>
                  )}
                    </>
                  )}
                </div>
              )}

              {submitted && !result && (
                <div className="random-panel">
                  <p>
                    Waiting for both submissions... {submissionStatus.submittedCount}/{submissionStatus.totalPlayers}
                  </p>
                  {submissionCountdown.active && (
                    <p>
                      <strong>Countdown:</strong> {submissionCountdown.secondsLeft}s
                    </p>
                  )}
                </div>
              )}

              <div className="random-panel">
                <h4>Chat</h4>
                {result && (
                  <p className="random-note">Post-result chat is active. You can continue discussion here.</p>
                )}
                <div className="random-chat-box">
                  {messages.map((m, i) => (
                    <p key={i}>
                      <b>
                        {m.socketId === socket.id
                          ? "You"
                          : m.name || playerNameByUserId.get(String(m.userId)) || "Opponent"}
                      </b>: {m.text}
                    </p>
                  ))}
                </div>
                <div className="random-chat-row">
                  <input
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                    placeholder="Type message"
                  />
                  <button className="random-secondary" onClick={sendMessage}>Send</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RandomBox;
