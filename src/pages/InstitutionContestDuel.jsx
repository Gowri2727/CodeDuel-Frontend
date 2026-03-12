import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import "../styles/solo-box.css";
import "../styles/institute.css";

function secondsLeft(dateValue, now = Date.now()) {
  if (!dateValue) return 0;
  return Math.max(Math.ceil((new Date(dateValue).getTime() - now) / 1000), 0);
}

function formatDateTime(dateValue) {
  if (!dateValue) return "Not set";
  const parsed = new Date(dateValue);
  if (!Number.isFinite(parsed.getTime())) return "Invalid time";
  return parsed.toLocaleString();
}

function isEnrolledStatus(status) {
  return ["registered", "submitted", "auto_submitted", "forfeited"].includes(String(status || ""));
}

function toPrettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeCode(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function getStarterCode(language, question) {
  if (question?.starterCode) return String(question.starterCode);
  const sampleInput = question?.sampleTestCases?.[0]?.input;
  const keys = sampleInput && typeof sampleInput === "object" && !Array.isArray(sampleInput)
    ? Object.keys(sampleInput).filter(Boolean)
    : ["data"];
  const params = keys.length ? keys.join(", ") : "data";
  const safeLanguage = String(language || "python").toLowerCase();
  if (safeLanguage.includes("python")) {
    return `class Solution:\n    def solve(self, ${params}):\n        # Write your logic here\n        pass\n`;
  }
  if (safeLanguage.includes("javascript") || safeLanguage === "js") {
    return `function solve(${params}) {\n  // Write your logic here\n}\n`;
  }
  if (safeLanguage.includes("java")) {
    return `class Solution {\n    public Object solve(Object data) {\n        // Write your logic here\n        return null;\n    }\n}\n`;
  }
  return "// Write your solution here\n";
}

function InstitutionContestDuel() {
  const navigate = useNavigate();
  const { contestId } = useParams();
  const token = localStorage.getItem("token");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [contest, setContest] = useState(null);
  const [clock, setClock] = useState(Date.now());
  const [code, setCode] = useState("");
  const [starterCode, setStarterCode] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);

  const timeoutHandledRef = useRef(false);
  const forfeitAttemptedRef = useRef(false);

  const loadContest = useCallback(async () => {
    if (!contestId) return;
    const res = await API.get(`/institution/contests/${contestId}`, headers);
    const payload = res.data?.contest || null;
    setContest(payload);
    if (payload?.question) {
      const starter = getStarterCode(payload?.language, payload?.question);
      setStarterCode(starter);
      setCode(prev => (normalizeCode(prev) ? prev : starter));
    }
  }, [contestId]);

  useEffect(() => {
    const init = async () => {
      try {
        await loadContest();
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load contest.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadContest]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    timeoutHandledRef.current = false;
    setHasSubmitted(false);
  }, [contestId]);

  useEffect(() => {
    const refresh = () => {
      loadContest().catch(() => {});
    };
    socket.on("institution-contest-started", refresh);
    socket.on("institution-contest-submission-update", refresh);
    socket.on("institution-contest-finished", refresh);
    return () => {
      socket.off("institution-contest-started", refresh);
      socket.off("institution-contest-submission-update", refresh);
      socket.off("institution-contest-finished", refresh);
    };
  }, [loadContest]);

  const isLive = String(contest?.status || "") === "live";
  const enrolled = isEnrolledStatus(contest?.myEnrollmentStatus);
  const canSubmit = Boolean(contest?.canSubmit);
  const canEnroll = Boolean(contest?.canEnroll);
  const countdownTarget = isLive ? contest?.endsAt : contest?.scheduledStartAt;
  const countdownSeconds = secondsLeft(countdownTarget, clock);
  const participantCount = Number(contest?.participantCount || contest?.participants?.length || 0);
  const question = contest?.question || null;

  const workspaceTitle = useMemo(() => {
    if (!isLive) return "Contest Workspace";
    return canSubmit ? "Solo Duel Workspace" : "Read Only Workspace";
  }, [isLive, canSubmit]);

  useEffect(() => {
    const status = String(contest?.myEnrollmentStatus || "");
    if (!contest || !isLive) return;
    if (status !== "submitted" && status !== "auto_submitted" && status !== "forfeited") return;
    setMessage("You already completed this contest. Entry is locked.");
    const timer = setTimeout(() => navigate("/home"), 900);
    return () => clearTimeout(timer);
  }, [contest, isLive, navigate]);

  const enrollContest = async () => {
    if (!contestId || !canEnroll) return;
    try {
      setMessage("");
      await API.post(`/institution/contests/${contestId}/enroll`, {}, headers);
      await loadContest();
      setMessage("Enrollment successful.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Enrollment failed.");
    }
  };

  const runCode = async () => {
    if (!contestId) return;
    try {
      setRunning(true);
      setMessage("");
      setRunResult(null);
      const res = await API.post(
        `/institution/contests/${contestId}/run`,
        { code, language: contest?.language || "python" },
        headers
      );
      setRunResult(res.data?.result || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Run failed.");
    } finally {
      setRunning(false);
    }
  };

  const submitCode = async ({ silentRedirect = false, auto = false } = {}) => {
    if (!contestId) return false;
    try {
      setSubmitting(true);
      setMessage("");
      const res = await API.post(
        `/institution/contests/${contestId}/submit`,
        { code, language: contest?.language || "python" },
        headers
      );
      setHasSubmitted(true);
      if (!silentRedirect) {
        const redirectTo = String(res?.data?.redirectTo || "/home");
        setMessage("Submission sent. Redirecting to Home...");
        navigate(redirectTo);
      }
      return true;
    } catch (err) {
      setMessage(err?.response?.data?.message || "Submission failed.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const forfeitContestAndLeave = async target => {
    if (!contestId) {
      navigate(target || "/institution");
      return;
    }
    if (!isLive || !canSubmit || hasSubmitted) {
      navigate(target || "/institution");
      return;
    }
    try {
      forfeitAttemptedRef.current = true;
      setForfeiting(true);
      await API.post(`/institution/contests/${contestId}/forfeit`, {}, headers);
    } catch {
      // ignore forfeit request failures and continue navigation
    } finally {
      setForfeiting(false);
      navigate(target || "/institution");
    }
  };

  useEffect(() => () => {
    if (!contestId || forfeitAttemptedRef.current) return;
    if (!isLive || !canSubmit || hasSubmitted) return;
    forfeitAttemptedRef.current = true;
    API.post(`/institution/contests/${contestId}/forfeit`, {}, headers).catch(() => {});
  }, [contestId, isLive, canSubmit, hasSubmitted]);

  useEffect(() => {
    if (!contest) return;
    if (timeoutHandledRef.current) return;

    const status = String(contest.status || "");
    if (status === "finished") {
      timeoutHandledRef.current = true;
      setMessage("Contest ended. Redirecting to Home...");
      const timer = setTimeout(() => navigate("/home"), 900);
      return () => clearTimeout(timer);
    }

    if (!isLive || countdownSeconds > 0) return;

    timeoutHandledRef.current = true;
    const runTimeoutFlow = async () => {
      if (canSubmit && !hasSubmitted) {
        setMessage("Time ended. Auto-submitting your latest code...");
        await submitCode({ silentRedirect: true, auto: true });
      }
      setMessage("Contest time ended. Redirecting to Home...");
      setTimeout(() => navigate("/home"), 900);
    };
    runTimeoutFlow();
  }, [contest, isLive, countdownSeconds, canSubmit, hasSubmitted, navigate]);

  if (loading) return <p>Loading duel mode...</p>;
  if (!contest) {
    return (
      <div className="solo-shell">
        <div className="solo-card">
          <p className="solo-error">Contest not found.</p>
          <div className="solo-action-row">
            <button className="solo-secondary" onClick={() => navigate("/institution")}>Back</button>
            <button className="solo-secondary" onClick={() => navigate("/home")}>Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="solo-shell">
      <div className="solo-card">
        <div className="solo-header">
          <h2>{contest.title}</h2>
          <p>{contest.description || "Institution coding duel."}</p>
          <div className="solo-tags">
            <span>Status: {contest.status}</span>
            <span>Difficulty: {contest.difficulty}</span>
            <span>Participants: {participantCount}</span>
            <span>
              {isLive ? "Ends in" : "Starts in"}: {countdownSeconds}s
            </span>
            <span>Language: {contest.language || "python"}</span>
          </div>
          <p>
            Start: {formatDateTime(contest.scheduledStartAt)} | End: {formatDateTime(contest.endsAt || contest.scheduledEndAt)}
          </p>
        </div>

        <div className={question ? "solo-workspace" : ""}>
          {!!question && (
            <div className="solo-left-pane">
              <div className="solo-problem-head">
                <h3>{question.title}</h3>
                <div className="solo-tags">
                  <span>{contest.language || "Any"}</span>
                  <span>{contest.difficulty || "Easy"}</span>
                  <span>{contest.type || "DSA"}</span>
                </div>
              </div>
              <div className="solo-section">
                {!!question.narrative && (
                  <div className="solo-section">
                    <h4>Story</h4>
                    <p className="solo-description">{question.narrative}</p>
                  </div>
                )}
                <h4>Problem Statement</h4>
                <p className="solo-description">{question.problemStatement || question.description}</p>
                {!!question.inputFormat && <p><strong>Input Format:</strong> {question.inputFormat}</p>}
                {!!question.outputFormat && <p><strong>Output Format:</strong> {question.outputFormat}</p>}
                {!!question.constraints?.length && (
                  <>
                    <p><strong>Constraints:</strong></p>
                    <ul className="solo-list">
                      {question.constraints.map((item, idx) => <li key={`constraint-${idx}`}>{item}</li>)}
                    </ul>
                  </>
                )}
                {!!question.sampleTestCases?.length && (
                  <>
                    <p><strong>Sample Test Cases:</strong></p>
                    {question.sampleTestCases.map((testCase, idx) => (
                      <div key={`sample-${idx}`} className="solo-example-card">
                        <p className="solo-example-title">Sample {idx + 1}</p>
                        <p><strong>Input:</strong></p>
                        <pre>{toPrettyJson(testCase?.input)}</pre>
                        <p><strong>Output:</strong></p>
                        <pre>{toPrettyJson(testCase?.output)}</pre>
                      </div>
                    ))}
                  </>
                )}
                {!!question.examples?.length && (
                  <>
                    <p><strong>Examples:</strong></p>
                    {question.examples.map((example, idx) => (
                      <div key={`example-${idx}`} className="solo-example-card">
                        <p className="solo-example-title">{example.title || `Example ${idx + 1}`}</p>
                        <p><strong>Input:</strong> {example.inputText}</p>
                        <p><strong>Output:</strong> {example.outputText}</p>
                        {!!example.explanation && <p><strong>Explanation:</strong> {example.explanation}</p>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="solo-right-pane">
            <h3>{workspaceTitle}</h3>
            {!enrolled && canEnroll && (
              <div className="solo-action-row">
                <button className="solo-primary" onClick={enrollContest}>Enroll to Enter Contest</button>
              </div>
            )}
            {!isLive && (
              <p className="solo-description">
                Contest is not live yet. Countdown: {countdownSeconds}s
              </p>
            )}
            {isLive && !canSubmit && (
              <p className="solo-description">You are not enrolled for solo submission in this contest.</p>
            )}
            {isLive && canSubmit && (
              <>
                {!!question?.functionSignature && (
                  <div className="solo-run-panel">
                    <p><strong>Expected Function:</strong> {question.functionSignature}</p>
                  </div>
                )}
                <div className="solo-toolbar">
                  <button className="solo-secondary" onClick={() => setCode(getStarterCode(contest?.language, question))}>
                    Reset Code
                  </button>
                </div>
                <textarea
                  rows={22}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Write your code here..."
                />
                <div className="solo-action-row">
                  <button className="solo-secondary" onClick={runCode} disabled={running}>
                    {running ? "Running..." : "Run"}
                  </button>
                  <button className="solo-primary" onClick={() => submitCode()} disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </>
            )}

            {!!runResult && (
              <div className="solo-run-panel">
                <p><strong>Compiler:</strong> {runResult.compilerMessage || "Unknown"}</p>
                <p><strong>Sample Passed:</strong> {runResult.samplePassedCount || 0}/{runResult.sampleTotal || 0}</p>
                <p><strong>Hidden Passed:</strong> {runResult.hiddenPassedCount || 0}/{runResult.hiddenTotal || 0}</p>
                <p><strong>Total Passed:</strong> {runResult.totalPassed || 0}/{runResult.totalCases || 0}</p>
                <p><strong>Total Pass %:</strong> {runResult.totalPassPercentage || 0}%</p>
                {!!runResult.judgeNote && <p><strong>Judge Note:</strong> {runResult.judgeNote}</p>}
                <p><strong>Time Complexity:</strong> {runResult.timeComplexity || "Unknown"}</p>
                <p><strong>Space Complexity:</strong> {runResult.spaceComplexity || "Unknown"}</p>
                <p><strong>Efficiency Score:</strong> {runResult.efficiencyScore ?? 0}</p>
                {(runResult?.errorSection?.message || runResult?.runtimeError?.hasError) && (
                  <div className="solo-error-section">
                    <p><strong>Error Section:</strong> {runResult?.errorSection?.title || "Runtime / Compile Error"}</p>
                    {!!runResult?.errorSection?.message && <p>{runResult.errorSection.message}</p>}
                    {!!runResult?.runtimeError?.hasError && <p>{runResult.runtimeError.message}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="solo-action-row">
          <button className="solo-secondary" onClick={() => forfeitContestAndLeave("/institution")} disabled={forfeiting}>
            {forfeiting ? "Leaving..." : "Back to Institution"}
          </button>
          <button className="solo-secondary" onClick={() => forfeitContestAndLeave("/home")} disabled={forfeiting}>
            {forfeiting ? "Leaving..." : "Home"}
          </button>
        </div>
        {!!message && (
          <p className={String(message).toLowerCase().includes("failed") || String(message).toLowerCase().includes("not allowed")
            ? "solo-error"
            : "institute-note"}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default InstitutionContestDuel;
