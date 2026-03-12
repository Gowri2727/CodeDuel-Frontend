import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
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

function autoContestMeta({ difficulty, type, topic }) {
  const safeDifficulty = String(difficulty || "Easy").trim() || "Easy";
  const safeType = String(type || "DSA").trim() || "DSA";
  const topicPart = String(topic || "").trim();
  const title = topicPart
    ? `${topicPart} ${safeDifficulty === "Hard" ? "Championship" : "Clash"}`
    : `${safeDifficulty} ${safeType} Challenge`;
  const description = topicPart
    ? `${safeDifficulty} ${safeType} contest focused on ${topicPart}.`
    : `${safeDifficulty} ${safeType} institutional coding contest.`;
  return { title, description };
}

function countdownLabel(seconds) {
  const total = Math.max(Number(seconds || 0), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remSeconds = total % 60;
  return `${hours}h ${minutes}m ${remSeconds}s`;
}

function InstituteDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [contests, setContests] = useState([]);
  const [selectedContest, setSelectedContest] = useState(null);
  const [deletingContestId, setDeletingContestId] = useState("");
  const [clock, setClock] = useState(Date.now());

  const [form, setForm] = useState({
    difficulty: "Easy",
    type: "DSA",
    topic: "",
    description: "",
    durationMinutes: 15,
    scheduledStartAt: "",
    scheduledEndAt: ""
  });

  const load = useCallback(async () => {
    const [dashboardRes, contestsRes] = await Promise.all([
      API.get("/institution/me/dashboard", headers),
      API.get("/institution/me/contests", headers)
    ]);
    setDashboard(dashboardRes.data || null);
    setContests(contestsRes.data?.contests || []);
  }, [token]);

  useEffect(() => {
    const init = async () => {
      try {
        await load();
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load institute dashboard.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      load().catch(() => {});
    };
    socket.on("institution-contest-started", refresh);
    socket.on("institution-contest-finished", refresh);
    socket.on("institution-contest-submission-update", refresh);
    socket.on("institution-contest-enrollment-update", refresh);
    return () => {
      socket.off("institution-contest-started", refresh);
      socket.off("institution-contest-finished", refresh);
      socket.off("institution-contest-submission-update", refresh);
      socket.off("institution-contest-enrollment-update", refresh);
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const createContest = async () => {
    try {
      setMessage("");
      const durationMinutes = Math.max(2, Number(form.durationMinutes || 15));
      const generatedMeta = autoContestMeta(form);
      const scheduledStartAtIso = form.scheduledStartAt
        ? new Date(form.scheduledStartAt).toISOString()
        : undefined;
      const scheduledEndAtIso = form.scheduledEndAt
        ? new Date(form.scheduledEndAt).toISOString()
        : undefined;

      if (scheduledStartAtIso && scheduledEndAtIso && new Date(scheduledEndAtIso).getTime() <= new Date(scheduledStartAtIso).getTime()) {
        setMessage("End time must be after start time.");
        return;
      }

      const payload = {
        title: generatedMeta.title,
        description: String(form.description || generatedMeta.description).trim(),
        difficulty: form.difficulty,
        type: form.type,
        topic: String(form.topic || "").trim(),
        language: "python",
        timeLimitSeconds: durationMinutes * 60,
        scheduledStartAt: scheduledStartAtIso,
        scheduledEndAt: scheduledEndAtIso
      };
      await API.post("/institution/contests", payload, headers);
      await load();
      setMessage("Contest created.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to create contest.");
    }
  };

  const finalizeContest = async contestId => {
    try {
      setMessage("");
      await API.post(`/institution/contests/${contestId}/finalize`, {}, headers);
      await load();
      setMessage("Contest finalized.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to finalize contest.");
    }
  };

  const deleteContest = async contestId => {
    if (!contestId) return;
    const confirmDelete = window.confirm("Delete this contest permanently?");
    if (!confirmDelete) return;
    try {
      setDeletingContestId(String(contestId));
      setMessage("");
      try {
        await API.delete(`/institution/contests/${contestId}`, headers);
      } catch (deleteErr) {
        if (deleteErr?.response?.status === 404 || deleteErr?.response?.status === 405) {
          await API.post(`/institution/contests/${contestId}/delete`, {}, headers);
        } else {
          throw deleteErr;
        }
      }
      if (selectedContest?.contestId === contestId) {
        setSelectedContest(null);
      }
      await load();
      setMessage("Contest deleted.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to delete contest.");
    } finally {
      setDeletingContestId("");
    }
  };

  const openContest = async contestId => {
    try {
      const res = await API.get(`/institution/contests/${contestId}/submissions`, headers);
      setSelectedContest({
        contestId,
        submissions: res.data?.submissions || []
      });
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load submissions.");
    }
  };

  const contestRows = useMemo(() => (
    contests.map(contest => {
      const startIn = secondsLeft(contest?.scheduledStartAt, clock);
      const endIn = secondsLeft(contest?.endsAt, clock);
      return {
        ...contest,
        startIn,
        endIn
      };
    })
  ), [contests, clock]);
  const metaPreview = autoContestMeta(form);

  if (loading) {
    return <p>Loading institute dashboard...</p>;
  }

  return (
    <div className="institute-shell">
      <div className="institute-page">
        <div className="institute-header">
          <h2>Institution Admin Dashboard</h2>
          <p>
            {dashboard?.institution?.name || "Institution"} ({dashboard?.institution?.code || "-"})
          </p>
          <div className="institute-chip-row">
            <span className="institute-chip">Active: {(dashboard?.activeContests || []).length}</span>
            <span className="institute-chip">Upcoming: {(dashboard?.upcomingContests || []).length}</span>
          </div>
        </div>

        <div className="institute-card">
          <h3>Create Contest</h3>
          <p className="institute-muted">
            Preview Name: <strong>{metaPreview.title}</strong>
          </p>
          <p className="institute-muted">Preview Description: {form.description || metaPreview.description}</p>
          <div className="institute-form-grid">
            <label className="institute-field">
              <span>Difficulty</span>
              <select
                value={form.difficulty}
                onChange={e => setForm(prev => ({ ...prev, difficulty: e.target.value }))}
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </label>
            <label className="institute-field">
              <span>Type</span>
              <select
                value={form.type}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
              >
                <option>DSA</option>
              </select>
            </label>
            <label className="institute-field">
              <span>Optional Topic</span>
              <input
                placeholder="Example: sliding window"
                value={form.topic}
                onChange={e => setForm(prev => ({ ...prev, topic: e.target.value }))}
              />
            </label>
            <label className="institute-field">
              <span>Description (optional)</span>
              <input
                placeholder={metaPreview.description}
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <label className="institute-field">
              <span>Set Duration (minutes)</span>
              <input
                type="number"
                min="2"
                max="180"
                value={form.durationMinutes}
                onChange={e => setForm(prev => ({ ...prev, durationMinutes: Math.max(2, Number(e.target.value || 15)) }))}
              />
            </label>
            <label className="institute-field">
              <span>Set Start Time</span>
              <input
                type="datetime-local"
                value={form.scheduledStartAt}
                onChange={e => setForm(prev => ({ ...prev, scheduledStartAt: e.target.value }))}
              />
            </label>
            <label className="institute-field">
              <span>Set End Time</span>
              <input
                type="datetime-local"
                value={form.scheduledEndAt}
                onChange={e => setForm(prev => ({ ...prev, scheduledEndAt: e.target.value }))}
              />
            </label>
          </div>
          <div className="institute-actions">
            <button className="institute-btn primary" onClick={createContest}>Create Contest</button>
          </div>
        </div>

        <div className="institute-card">
          <h3>Contests</h3>
          {!contestRows.length && <p className="institute-muted">No contests yet.</p>}
          {contestRows.map(contest => (
            <div key={contest._id} className="institute-list-row">
              <div>
                <p className="institute-row-title">
                  {contest.title} | {contest.status} | {contest.difficulty} | {contest.type}
                </p>
                {!!contest.description && <p className="institute-muted">{contest.description}</p>}
                <p className="institute-muted">
                  Enrolled: {contest.enrolledCount || 0}/{contest.participantCount || 0}
                  {" "} | Duration: {Math.round((contest.timeLimitSeconds || 900) / 60)} min
                </p>
                <p className="institute-muted">Scheduled Start: {formatDateTime(contest.scheduledStartAt)}</p>
                <p className="institute-muted">Scheduled End: {formatDateTime(contest.scheduledEndAt || contest.endsAt)}</p>
                {contest.status === "scheduled" && contest.startIn > 0 && (
                  <p className="institute-muted">Start available in: {countdownLabel(contest.startIn)}</p>
                )}
                {contest.status === "live" && (
                  <p className="institute-muted">Live countdown: {countdownLabel(contest.endIn)}</p>
                )}
              </div>
              <div className="institute-actions">
                <button className="institute-btn" onClick={() => openContest(contest._id)}>View Submissions</button>
                {contest.status === "scheduled" && contest.startIn > 0 && (
                  <button className="institute-btn" disabled>
                    Auto starts in {countdownLabel(contest.startIn)}
                  </button>
                )}
                {contest.status === "scheduled" && contest.startIn <= 0 && (
                  <button className="institute-btn" disabled>
                    Auto starting...
                  </button>
                )}
                {(contest.status === "live" || contest.status === "evaluating") && (
                  <button className="institute-btn danger" onClick={() => finalizeContest(contest._id)}>Finalize</button>
                )}
                <button
                  className="institute-btn danger"
                  onClick={() => deleteContest(contest._id)}
                  disabled={deletingContestId === String(contest._id)}
                >
                  {deletingContestId === String(contest._id) ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {!!selectedContest && (
          <div className="institute-card">
            <h3>Submissions ({selectedContest.contestId})</h3>
            {!selectedContest.submissions.length && <p className="institute-muted">No submissions yet.</p>}
            {selectedContest.submissions.map(row => (
              <div key={row.userId} className="institute-submission">
                <p>
                  <strong>{row.name}</strong> | {row.status} | {row.result?.compilerMessage || "Not submitted"}
                </p>
                <p className="institute-muted">
                  Time: {row.result?.timeComplexity || "Unknown"} | Space: {row.result?.spaceComplexity || "Unknown"}
                </p>
                <pre>{row.code || ""}</pre>
              </div>
            ))}
          </div>
        )}

        <div className="institute-actions">
          <button className="institute-btn" onClick={() => navigate("/institution-ranking")}>Open Ranking</button>
          <button className="institute-btn" onClick={() => navigate("/home")}>Home</button>
        </div>
        {!!message && <p className="institute-note">{message}</p>}
      </div>
    </div>
  );
}

export default InstituteDashboard;
