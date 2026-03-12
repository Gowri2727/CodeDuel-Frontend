import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import "../styles/institute.css";

function secondsLeft(expiresAt, now = Date.now()) {
  if (!expiresAt) return 0;
  return Math.max(Math.ceil((new Date(expiresAt).getTime() - now) / 1000), 0);
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

function buildFriendRelationMap(payload) {
  const map = {};
  (payload?.friends || []).forEach(item => {
    map[String(item?._id || "")] = "friend";
  });
  (payload?.sentRequests || []).forEach(item => {
    const id = String(item?._id || "");
    if (!id || map[id] === "friend") return;
    map[id] = "outgoing_pending";
  });
  (payload?.receivedRequests || []).forEach(item => {
    const id = String(item?._id || "");
    if (!id || map[id] === "friend" || map[id] === "outgoing_pending") return;
    map[id] = "incoming_pending";
  });
  return map;
}

function relationButtonLabel(relation, isSelf) {
  if (isSelf) return "You";
  if (relation === "friend") return "Already Friend";
  if (relation === "outgoing_pending") return "Requested";
  if (relation === "incoming_pending") return "Accept in Friends";
  return "Add Friend";
}

function Institution() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const selfUserId = localStorage.getItem("userId");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [linkCode, setLinkCode] = useState("");
  const [linkName, setLinkName] = useState("");
  const [enrollingContestId, setEnrollingContestId] = useState("");
  const [friendLoadingId, setFriendLoadingId] = useState("");
  const [relationByUser, setRelationByUser] = useState({});
  const [userInfoLoadingId, setUserInfoLoadingId] = useState("");
  const [selectedUserInfo, setSelectedUserInfo] = useState(null);

  const [clock, setClock] = useState(Date.now());

  const activeContests = dashboard?.activeContests || [];
  const upcomingContests = dashboard?.upcomingContests || [];
  const pastContests = dashboard?.pastContests || [];
  const leaderboard = dashboard?.leaderboard || [];
  const isStudentViewer = String(dashboard?.viewerRole || "student") === "student";

  const loadDashboard = useCallback(async () => {
    const [dashboardRes, listRes] = await Promise.all([
      API.get("/institution/me/dashboard", headers),
      API.get("/institution/list").catch(() => ({ data: [] }))
    ]);
    setDashboard(dashboardRes.data || null);
    setInstitutions(Array.isArray(listRes.data) ? listRes.data : []);
  }, [token]);

  const loadFriendRelations = useCallback(async () => {
    try {
      const res = await API.get("/friends", headers);
      setRelationByUser(buildFriendRelationMap(res.data || {}));
    } catch {
      setRelationByUser({});
    }
  }, [token]);

  useEffect(() => {
    const load = async () => {
      try {
        await Promise.all([loadDashboard(), loadFriendRelations()]);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load institution mode.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loadDashboard, loadFriendRelations]);

  useEffect(() => {
    const refresh = () => {
      loadDashboard().catch(() => {});
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
  }, [loadDashboard]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const linkInstitution = async () => {
    try {
      setMessage("");
      await API.post(
        "/institution/link",
        {
          collegeCode: String(linkCode || "").trim().toUpperCase(),
          collegeName: String(linkName || "").trim()
        },
        headers
      );
      await loadDashboard();
      setMessage("Institution linked successfully.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Unable to link institution.");
    }
  };

  const enrollContest = async contestId => {
    if (!contestId) return;
    try {
      setEnrollingContestId(String(contestId));
      setMessage("");
      await API.post(`/institution/contests/${contestId}/enroll`, {}, headers);
      await loadDashboard();
      setMessage("Enrolled successfully.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Enrollment failed.");
    } finally {
      setEnrollingContestId("");
    }
  };

  const openContest = contestId => {
    if (!contestId) return;
    navigate(`/institution/duel/${contestId}`);
  };

  const sendFriendRequest = async targetUserId => {
    if (!targetUserId || String(targetUserId) === String(selfUserId)) return;
    const relation = relationByUser[String(targetUserId)] || "none";
    if (relation !== "none") return;
    try {
      setFriendLoadingId(String(targetUserId));
      setMessage("");
      await API.post("/friends/send", { userId: targetUserId }, headers);
      setRelationByUser(prev => ({ ...prev, [String(targetUserId)]: "outgoing_pending" }));
      setMessage("Friend request sent.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Unable to send friend request.");
    } finally {
      setFriendLoadingId("");
    }
  };

  const viewUserInfo = async targetUserId => {
    if (!targetUserId) return;
    try {
      setUserInfoLoadingId(String(targetUserId));
      const res = await API.get(`/users/${targetUserId}`, headers);
      setSelectedUserInfo(res.data || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Unable to load user info.");
    } finally {
      setUserInfoLoadingId("");
    }
  };

  if (loading) return <p>Loading institution mode...</p>;

  if (!dashboard?.linked) {
    return (
      <div className="institute-shell">
        <div className="institute-page">
          <div className="institute-header">
            <h2>Institution Mode (Optional)</h2>
            <p>{dashboard?.modeSafety || "You are currently in normal mode. No restrictions are applied."}</p>
          </div>
          <div className="institute-card">
            <label className="institute-field">
              <span>College Name (Optional)</span>
              <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Your college name" />
            </label>
            <label className="institute-field">
              <span>College Code</span>
              <select
                value={linkCode}
                onChange={e => {
                  const code = String(e.target.value || "").toUpperCase();
                  const selected = institutions.find(item => String(item.code || "").toUpperCase() === code);
                  setLinkCode(code);
                  if (selected) setLinkName(selected.name || linkName);
                }}
              >
                <option value="">Select institution code</option>
                {institutions.map(item => (
                  <option key={item.code} value={item.code}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </label>
            <div className="institute-actions">
              <button className="institute-btn primary" onClick={linkInstitution}>Link Institution</button>
              <button className="institute-btn" onClick={() => navigate("/home")}>Home</button>
            </div>
          </div>
          {!!message && <p className="institute-note">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="institute-shell">
      <div className="institute-page">
        <div className="institute-header">
          <h2>{dashboard.institution?.name} Dashboard</h2>
          <p>Code: {dashboard.institution?.code} | Place: {dashboard.institution?.place || "N/A"}</p>
          <div className="institute-chip-row">
            <span className="institute-chip">Rank #{dashboard.personalStats?.currentRank || "-"}</span>
            <span className="institute-chip">Contests {dashboard.personalStats?.contestsParticipated || 0}</span>
            <span className="institute-chip">Wins {dashboard.personalStats?.wins || 0}</span>
            <span className="institute-chip">Pass Rate {dashboard.personalStats?.accuracyPercentage || 0}%</span>
          </div>
        </div>

        <div className="institute-card">
          <h3>Active Contests</h3>
          {!activeContests.length && <p className="institute-muted">No active contests now.</p>}
          {activeContests.map(contest => (
            <div key={contest._id} className="institute-list-row">
              <div>
                <p className="institute-row-title">
                  {contest.title} | {contest.difficulty} | {contest.type}
                </p>
                {!!contest.description && <p className="institute-muted">{contest.description}</p>}
                <p className="institute-muted">
                  Time left: {secondsLeft(contest.endsAt)}s | Enrolled: {contest.enrolledCount || 0}/{contest.participantCount || 0}
                </p>
                <p className="institute-muted">
                  Start: {formatDateTime(contest.startedAt || contest.scheduledStartAt)} | End: {formatDateTime(contest.endsAt)}
                </p>
              </div>
              <div className="institute-actions">
                {(() => {
                  const status = String(contest.myEnrollmentStatus || "");
                  let actionLabel = "Not Enrolled";
                  if (contest.canSubmit) actionLabel = "Enter Duel Mode";
                  else if (status === "submitted" || status === "auto_submitted") actionLabel = "Already Submitted";
                  else if (status === "forfeited") actionLabel = "Forfeited";
                  return (
                <button
                  className="institute-btn primary"
                  onClick={() => openContest(contest._id)}
                  disabled={!contest.canSubmit}
                >
                  {actionLabel}
                </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

        <div className="institute-card">
          <h3>Upcoming Contests</h3>
          {!upcomingContests.length && <p className="institute-muted">No upcoming contests.</p>}
          {upcomingContests.map(contest => {
            const startIn = secondsLeft(contest.scheduledStartAt, clock);
            const myStatus = String(contest.myEnrollmentStatus || "not_invited");
            const enrolled = isEnrolledStatus(myStatus);
            const canEnroll = Boolean(contest.canEnroll);
            const enrollLabel = enrollingContestId === String(contest._id)
              ? "Enrolling..."
              : (enrolled ? "Enrolled" : (canEnroll ? "Enroll" : "Not Enrolled"));

            return (
              <div key={contest._id} className="institute-list-row">
                <div>
                  <p className="institute-row-title">{contest.title} | {contest.difficulty} | {contest.type}</p>
                  {!!contest.description && <p className="institute-muted">{contest.description}</p>}
                  <p className="institute-muted">
                    Start: {formatDateTime(contest.scheduledStartAt)}
                    {" "} | Countdown: {startIn}s
                  </p>
                  <p className="institute-muted">
                    End (planned): {formatDateTime(
                      contest.scheduledStartAt
                        ? new Date(new Date(contest.scheduledStartAt).getTime() + (Number(contest.timeLimitSeconds || 0) * 1000))
                        : null
                    )}
                  </p>
                  <p className="institute-muted">
                    Enrolled: {contest.enrolledCount || 0}/{contest.participantCount || 0}
                    {" "} | My status: {enrolled ? "enrolled" : "not enrolled"}
                  </p>
                </div>
                <div className="institute-actions">
                  {isStudentViewer && (
                    <>
                      <button
                        className="institute-btn"
                        onClick={() => enrollContest(contest._id)}
                        disabled={enrolled || !canEnroll || enrollingContestId === String(contest._id)}
                      >
                        {enrollLabel}
                      </button>
                      {enrolled && (
                        <button
                          className="institute-btn primary"
                          onClick={() => openContest(contest._id)}
                        >
                          Enter Duel Mode
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="institute-card">
          <div className="institute-info-head">
            <h3>Institution Leaderboard</h3>
          </div>
          {!leaderboard.length && <p className="institute-muted">No leaderboard data yet.</p>}
          {!!leaderboard.length && (
            <div className="institute-table-wrap">
              <table className="institute-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Contest Points</th>
                    <th>Pass Rate</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => {
                    const rowId = String(row.userId);
                    const isSelf = rowId === String(selfUserId);
                    const relation = relationByUser[rowId] || "none";
                    const relationLabel = relationButtonLabel(relation, isSelf);
                    const relationDisabled = relation !== "none" || friendLoadingId === rowId;
                    return (
                      <tr key={`${row.userId}-${idx}`}>
                        <td>
                          <span className={`institute-rank-badge rank-${row.rank <= 3 ? row.rank : "other"}`}>
                            #{row.rank}
                          </span>
                        </td>
                        <td>{row.name}</td>
                        <td>{row.totalContestPoints}</td>
                        <td>{row.highestPassRate ?? row.accuracy}%</td>
                        <td>{row.wins}</td>
                        <td>{row.losses}</td>
                        <td>
                          <div className="institute-action-stack">
                            {!isSelf && (
                              <button
                                className="institute-btn small"
                                disabled={relationDisabled}
                                onClick={() => {
                                  if (relation === "incoming_pending") {
                                    navigate("/friends");
                                    return;
                                  }
                                  sendFriendRequest(row.userId);
                                }}
                              >
                                {friendLoadingId === rowId ? "Sending..." : relationLabel}
                              </button>
                            )}
                            <button
                              className="institute-btn small"
                              onClick={() => viewUserInfo(row.userId)}
                              disabled={userInfoLoadingId === rowId}
                            >
                              {userInfoLoadingId === rowId ? "Loading..." : "Info"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!!selectedUserInfo && (
          <div className="institute-card">
            <div className="institute-info-head">
              <h3>User Info</h3>
              <button className="institute-btn small" onClick={() => setSelectedUserInfo(null)}>Close</button>
            </div>
            <div className="institute-info-grid">
              <p><strong>Name:</strong> {selectedUserInfo.name || "N/A"}</p>
              <p><strong>Email:</strong> {selectedUserInfo.email || "N/A"}</p>
              <p><strong>College:</strong> {selectedUserInfo.collegeName || selectedUserInfo.college || "N/A"}</p>
              <p><strong>Course:</strong> {selectedUserInfo.course || "N/A"}</p>
              <p><strong>Department:</strong> {selectedUserInfo.department || selectedUserInfo.stream || "N/A"}</p>
              <p><strong>Level:</strong> {selectedUserInfo.level || 1}</p>
              <p><strong>Points:</strong> {selectedUserInfo.points || 0}</p>
              <p><strong>Solved:</strong> {selectedUserInfo.solvedCount || 0}</p>
              <p><strong>Languages:</strong> {(selectedUserInfo.languages || []).join(", ") || "N/A"}</p>
              <p><strong>Bio:</strong> {selectedUserInfo.bio || "N/A"}</p>
            </div>
          </div>
        )}

        <div className="institute-card">
          <h3>Past Contest History</h3>
          {!pastContests.length && <p className="institute-muted">No contest history available.</p>}
          {pastContests.map(item => (
            <div key={item._id} className="institute-list-row">
              <div>
                <p className="institute-row-title">{item.title}</p>
                <p className="institute-muted">
                  Start: {formatDateTime(item.startedAt || item.scheduledStartAt)} | End: {formatDateTime(item.endsAt || item.finishedAt)}
                </p>
                <p className="institute-muted">
                  Rank: {item.myRank || "-"} | Correct: {item.myCorrect ? "Yes" : "No"}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="institute-actions">
          <button
            className="institute-btn"
            onClick={() => navigate(`/institution-ranking?focus=${encodeURIComponent(String(selfUserId || ""))}`)}
          >
            Open Full Ranking
          </button>
          <button className="institute-btn" onClick={() => navigate("/home")}>Home</button>
        </div>
        {!!message && <p className="institute-note">{message}</p>}
      </div>
    </div>
  );
}

export default Institution;
