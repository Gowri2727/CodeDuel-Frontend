import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import {
  buildRoomAutoJoinPath,
  clearPendingRoomAutoJoin,
  getPendingRoomAutoJoin,
  setPendingRoomAutoJoin
} from "../utils/roomInviteAutoJoin";
import "../styles/solo-box.css";

function renderObject(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getDefaultStarterCode(language) {
  const lang = String(language || "python").toLowerCase();

  if (lang.includes("python")) {
    return `class Solution:\n    def solve(self, data):\n        # Write your logic here\n        pass\n`;
  }

  if (lang.includes("java")) {
    return `class Solution {\n    public Object solve(Object data) {\n        // Write your logic here\n        return null;\n    }\n}\n`;
  }

  if (lang.includes("javascript") || lang === "js") {
    return `class Solution {\n  solve(data) {\n    // Write your logic here\n  }\n}\n`;
  }

  if (lang.includes("c++") || lang.includes("cpp")) {
    return `class Solution {\n  public:\n    void solve() {\n      // Write your logic here\n    }\n};\n`;
  }

  if (lang === "c") {
    return `void solve() {\n  // Write your logic here\n}\n`;
  }

  return "// Write your logic here\n";
}

function SoloBox() {
  const navigate = useNavigate();
  const [languages, setLanguages] = useState([]);
  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState("Easy");
  const [type, setType] = useState("DSA");

  const [question, setQuestion] = useState(null);
  const [code, setCode] = useState("");
  const [currentPoints, setCurrentPoints] = useState(0);
  const [runResult, setRunResult] = useState(null);
  const [result, setResult] = useState(null);
  const [popup, setPopup] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [toast, setToast] = useState("");
  const [toastKind, setToastKind] = useState("success");
  const [redirectPath, setRedirectPath] = useState("");
  const [redirectCountdown, setRedirectCountdown] = useState(0);
  const [incomingInvites, setIncomingInvites] = useState([]);

  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const headers = { headers: { Authorization: `Bearer ${token}` } };
  const isSoloBusy = Boolean(question && !result);

  useEffect(() => {
    API.get("/users/me", headers)
      .then(res => {
        setLanguages(res.data.languages || []);
        setLanguage(res.data.languages?.[0] || "");
        setCurrentPoints(Number(res.data.points || 0));
      })
      .catch(() => {
        setErrorMessage("Failed to load profile languages. You can still continue.");
      });
  }, []);

  useEffect(() => {
    const announceOnline = () => {
      if (userId) {
        socket.emit("user-online", userId);
      }
    };

    socket.on("connect", announceOnline);
    announceOnline();

    return () => {
      socket.off("connect", announceOnline);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const mode = isSoloBusy ? "solo_practice" : "idle";
    socket.emit("user-set-mode", { userId, mode });
    return () => {
      socket.emit("user-clear-mode", { userId });
    };
  }, [isSoloBusy, userId]);

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
        if (String(payload.status || "") === "accepted" && payload?.roomCode) {
          if (isSoloBusy) {
            setToastKind("info");
            setToast(`Invite accepted. You will join room ${payload.roomCode} after this solo challenge.`);
            setTimeout(() => setToast(""), 3000);
          } else {
            clearPendingRoomAutoJoin();
            navigate(buildRoomAutoJoinPath(payload.roomCode));
          }
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
  }, [isSoloBusy, navigate]);

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
    if (isSoloBusy) return;
    const pending = getPendingRoomAutoJoin();
    if (!pending?.roomCode) return;
    clearPendingRoomAutoJoin();
    navigate(buildRoomAutoJoinPath(pending.roomCode));
  }, [isSoloBusy, navigate]);

  useEffect(() => {
    if (!redirectPath) return;

    setRedirectCountdown(20);
    const intervalId = setInterval(() => {
      setRedirectCountdown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    const timeoutId = setTimeout(() => {
      navigate(redirectPath);
    }, 20000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [redirectPath, navigate]);

  const startSolo = async () => {
    setLoadingQuestion(true);
    setErrorMessage("");

    try {
      const res = await API.post("/solo/question", { language, difficulty, type }, headers);
      setQuestion(res.data);
      setResult(null);
      setRunResult(null);
      setPopup(null);
      setRedirectPath("");
      setRedirectCountdown(0);
      setCode(res.data?.starterCode || getDefaultStarterCode(language));
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErrorMessage(backendMessage || "Unable to start solo challenge right now. Please try again.");
    } finally {
      setLoadingQuestion(false);
    }
  };

  const runCode = async () => {
    if (!question) {
      setErrorMessage("Start a challenge before running code.");
      return;
    }

    setRunning(true);
    setErrorMessage("");

    try {
      const res = await API.post(
        "/solo/run",
        {
          questionId: question?._id || undefined,
          question: question?._id ? undefined : question,
          code,
          language
        },
        headers
      );
      setRunResult(res.data);
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErrorMessage(backendMessage || "Failed to run code. Please retry.");
    } finally {
      setRunning(false);
    }
  };

  const submitCode = async () => {
    if (!question) {
      setErrorMessage("Start a challenge before submitting code.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await API.post(
        "/solo/submit",
        {
          questionId: question?._id || undefined,
          question: question?._id ? undefined : question,
          code,
          language
        },
        headers
      );
      setResult(res.data);
      setPopup(res.data?.popup?.show ? res.data.popup : null);
      const awarded = Number(res.data?.awardedPoints || 0);
      const total = Number(res.data?.totalPoints || currentPoints);
      setCurrentPoints(total);
      const title = question?.title || "Challenge";

      if (awarded > 0) {
        setToastKind("success");
        setToast(`${title}: +${awarded} points earned. Total points: ${total}.`);
      } else {
        setToastKind("info");
        setToast(`${title}: submission saved. No new points awarded this time.`);
      }
      setTimeout(() => setToast(""), 2800);

      if (res.data?.redirectToHome) {
        setRedirectPath(res.data?.redirectPath || "/home");
      }
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      setErrorMessage(backendMessage || "Failed to submit solution. Please retry.");
    } finally {
      setSubmitting(false);
    }
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
        acceptedWhileMode: isSoloBusy ? "solo_practice" : "idle"
      });

      if (isSoloBusy) {
        setToastKind("info");
        setToast(`Invite accepted. Auto-joining room ${invite.roomCode} when this challenge ends.`);
        setTimeout(() => setToast(""), 3000);
      } else {
        clearPendingRoomAutoJoin();
        navigate(buildRoomAutoJoinPath(invite.roomCode));
      }
    }

    setIncomingInvites(prev => prev.filter(item => item.inviteId !== invite.inviteId));
  };

  return (
    <div className="solo-shell">
      {!!toast && <div className={`solo-toast solo-toast-${toastKind}`}>{toast}</div>}
      {incomingInvites.map(invite => (
        <div className="solo-invite-popup" key={invite.inviteId}>
          <p><strong>{invite.senderName || "Room Admin"}</strong> invited you to <strong>{invite.roomCode}</strong></p>
          <p>{invite.secondsLeft}s left</p>
          <div className="solo-invite-actions">
            <button className="solo-primary" onClick={() => respondInvite(invite, "accept")}>Accept</button>
            <button className="solo-secondary" onClick={() => respondInvite(invite, "decline")}>Cancel</button>
          </div>
        </div>
      ))}
      <div className="solo-card">
        <div className="solo-header">
          <h2>Solo Box</h2>
          <p>Long-form story problem on the left, coding workspace on the right.</p>
          <p><strong>Points:</strong> {currentPoints}</p>
          {!!redirectPath && redirectCountdown > 0 && (
            <div className="solo-redirect-row">
              <p>
                <strong>{String(redirectPath).startsWith("/room") ? "Redirecting to Room in:" : "Redirecting to Home in:"}</strong>{" "}
                {redirectCountdown}s
              </p>
              <button
                className="solo-secondary"
                onClick={() => navigate(redirectPath)}
              >
                {String(redirectPath).startsWith("/room") ? "Room Now" : "Home Now"}
              </button>
            </div>
          )}
        </div>

        {!question && (
          <div className="solo-config">
            <div className="solo-grid">
              <label>
                <span>Language</span>
                <select value={language} onChange={e => setLanguage(e.target.value)} disabled={loadingQuestion}>
                  {languages.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Difficulty</span>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)} disabled={loadingQuestion}>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </label>

              <label>
                <span>Type</span>
                <select value={type} onChange={e => setType(e.target.value)} disabled={loadingQuestion}>
                  <option>DSA</option>
                  <option>Normal</option>
                </select>
              </label>
            </div>

            <button className="solo-primary" onClick={startSolo} disabled={loadingQuestion}>
              {loadingQuestion ? "Starting..." : "Start Challenge"}
            </button>
          </div>
        )}

        {question && (
          <div className="solo-workspace">
            <div className="solo-left-pane">
              <div className="solo-problem-head">
                <h3>{question.title}</h3>
                <div className="solo-tags">
                  <span>{language || "Any"}</span>
                  <span>{difficulty}</span>
                  <span>{type}</span>
                  {question.generatedFrom && <span>{question.generatedFrom}</span>}
                </div>
              </div>

              {!!question.narrative && (
                <div className="solo-section">
                  <h4>Story</h4>
                  <p className="solo-description">{question.narrative}</p>
                </div>
              )}

              <div className="solo-section">
                <h4>Problem Statement</h4>
                <p className="solo-description">{question.problemStatement || question.description}</p>
              </div>

              {(question.inputFormat || question.outputFormat) && (
                <div className="solo-section-grid">
                  {!!question.inputFormat && (
                    <div className="solo-section">
                      <h4>Input Format</h4>
                      <p className="solo-description">{question.inputFormat}</p>
                    </div>
                  )}
                  {!!question.outputFormat && (
                    <div className="solo-section">
                      <h4>Output Format</h4>
                      <p className="solo-description">{question.outputFormat}</p>
                    </div>
                  )}
                </div>
              )}

              {!!question.examples?.length && (
                <div className="solo-section">
                  <h4>Examples</h4>
                  {question.examples.map((ex, index) => (
                    <div key={index} className="solo-example-card">
                      <p className="solo-example-title">{ex.title || `Example ${index + 1}`}</p>
                      <p><strong>Input:</strong> {ex.inputText}</p>
                      <p><strong>Output:</strong> {ex.outputText}</p>
                      {!!ex.explanation && <p><strong>Explanation:</strong> {ex.explanation}</p>}
                    </div>
                  ))}
                </div>
              )}

              {!!question.constraints?.length && (
                <div className="solo-section">
                  <h4>Constraints</h4>
                  <ul className="solo-list">
                    {question.constraints.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!question.topics?.length && (
                <div className="solo-section">
                  <h4>Topics</h4>
                  <div className="solo-tags">
                    {question.topics.map((topic, index) => <span key={index}>{topic}</span>)}
                  </div>
                </div>
              )}

              {!!question.companies?.length && (
                <div className="solo-section">
                  <h4>Companies</h4>
                  <div className="solo-tags">
                    {question.companies.map((company, index) => <span key={index}>{company}</span>)}
                  </div>
                </div>
              )}

              {!!question.hint && (
                <div className="solo-section">
                  <h4>Hint</h4>
                  <p className="solo-description">{question.hint}</p>
                </div>
              )}

              {!!question.followUp && (
                <div className="solo-section">
                  <h4>Follow-up</h4>
                  <p className="solo-description">{question.followUp}</p>
                </div>
              )}

              {!!question.sampleTestCases?.length && (
                <div className="solo-section">
                  <h4>Sample Test Cases</h4>
                  {question.sampleTestCases.map((tc, index) => (
                    <div className="solo-example-card" key={index}>
                      <p className="solo-example-title">Sample {index + 1}</p>
                      <p><strong>Input:</strong></p>
                      <pre>{renderObject(tc.input)}</pre>
                      <p><strong>Output:</strong></p>
                      <pre>{renderObject(tc.output)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="solo-right-pane">
              <div className="solo-toolbar">
                <button
                  className="solo-secondary"
                  onClick={() => setCode(question?.starterCode || getDefaultStarterCode(language))}
                >
                  Reset Code
                </button>
              </div>

              {!!question.functionSignature && (
                <div className="solo-run-panel">
                  <p><strong>Expected Function:</strong> {question.functionSignature}</p>
                </div>
              )}

              <textarea
                rows="22"
                placeholder="Write logic only"
                value={code}
                onChange={e => setCode(e.target.value)}
              />

              <div className="solo-action-row">
                <button className="solo-secondary" onClick={runCode} disabled={running}>
                  {running ? "Running..." : "Run"}
                </button>
                <button className="solo-primary" onClick={submitCode} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>

              {!!runResult && (
                <div className="solo-run-panel">
                  <p><strong>Run Status:</strong> {runResult.compilerMessage}</p>
                  <p><strong>Sample Passed:</strong> {runResult.samplePassed ? "Yes" : "No"}</p>
                  <p><strong>Sample Passed/Total:</strong> {runResult.samplePassedCount || 0}/{runResult.sampleTotal || 0}</p>
                  <p><strong>Failed Samples:</strong> {runResult.sampleFailedCount}</p>
                  <p><strong>Sample Pass %:</strong> {runResult.samplePassPercentage ?? 0}%</p>
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
                    <div className="solo-error-section">
                      <p><strong>Error Section:</strong> {runResult?.errorSection?.title || "Runtime / Compile Error"}</p>
                      {!!runResult?.errorSection?.message && <p>{runResult.errorSection.message}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {errorMessage && <p className="solo-error">{errorMessage}</p>}

        {result && (
          <div className="solo-result">
            <h4>Submission Result</h4>
            <div className="solo-result-grid">
              <p><strong>Status:</strong> {result.compilerMessage}</p>
              <p><strong>Correct:</strong> {String(result.isCorrect)}</p>
              <p><strong>Time:</strong> {result.timeComplexity}</p>
              <p><strong>Space:</strong> {result.spaceComplexity}</p>
              <p><strong>Score:</strong> {result.efficiencyScore}</p>
              <p><strong>Attempts:</strong> {result.attempts?.consecutiveFailed || 0} consecutive fails</p>
            </div>

            {!!result.metrics && (
              <div className="solo-run-panel">
                <p><strong>Total Cases:</strong> {result.metrics.totalCases}</p>
                <p><strong>Passed:</strong> {result.metrics.totalPassed}</p>
                <p><strong>Failed:</strong> {result.metrics.totalFailed}</p>
                <p><strong>Pass %:</strong> {result.metrics.passPercentage}%</p>
              </div>
            )}

            {!!result.aiComparison && (
              <div className="solo-run-panel">
                <p><strong>AI Comparison Summary:</strong> {result.aiComparison.summary}</p>
                {!!result.aiComparison.keyDifference && (
                  <p><strong>Key Difference:</strong> {result.aiComparison.keyDifference}</p>
                )}
                {!!result.aiComparison.whyWinnerWon && (
                  <p><strong>Why Winner Won:</strong> {result.aiComparison.whyWinnerWon}</p>
                )}
                {!!result.aiComparison.userMistake && (
                  <p><strong>User Mistake:</strong> {result.aiComparison.userMistake}</p>
                )}
                {!!result.aiComparison.improvementTip && (
                  <p><strong>Improvement Tip:</strong> {result.aiComparison.improvementTip}</p>
                )}
              </div>
            )}

            {result.runtimeError?.hasError && (
              <div className="solo-runtime-block">
                <p><strong>Runtime Error:</strong> {result.runtimeError.message}</p>
                {!!result.stderr && <pre>{result.stderr}</pre>}
              </div>
            )}

            {!!result.failedCases?.length && (
              <div className="solo-case-block">
                <p><strong>Failed Test Cases:</strong></p>
                {result.failedCases.map((c, index) => (
                  <div key={`${c.visibility}-${index}`} className="solo-case-item">
                    <p>Case {c.index} ({c.visibility})</p>
                    <p>Reason: {c.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {result.revealHiddenFailures && !!result.hiddenFailures?.length && (
              <div className="solo-hidden-block">
                <p><strong>Hidden Cases Revealed (after 3 failed submissions):</strong></p>
                {result.hiddenFailures.map((c, index) => (
                  <div key={`hidden-${index}`} className="solo-case-item">
                    <p>Hidden Case {c.index}</p>
                    <p>Reason: {c.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {!!result.userMessage && <p className="solo-reveal-note">{result.userMessage}</p>}
            <p className="solo-feedback">{result.feedback}</p>
          </div>
        )}

        {!!popup?.show && (
          <div className="solo-run-panel">
            <p><strong>{popup.title}:</strong> {popup.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SoloBox;
