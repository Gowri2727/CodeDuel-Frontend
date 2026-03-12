import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";
import "../styles/institute.css";

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

function rankTierLabel(rank) {
  const safeRank = Number(rank || 0);
  if (safeRank === 1) return "Grandmaster";
  if (safeRank <= 3) return "Elite";
  if (safeRank <= 10) return "Diamond";
  if (safeRank <= 25) return "Platinum";
  return "Challenger";
}

function InstitutionRanking() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");
  const selfUserId = localStorage.getItem("userId");
  const focusUserId = String(new URLSearchParams(location.search).get("focus") || selfUserId || "");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState(null);
  const [friendLoadingId, setFriendLoadingId] = useState("");
  const [relationByUser, setRelationByUser] = useState({});
  const [userInfoLoadingId, setUserInfoLoadingId] = useState("");
  const [selectedUserInfo, setSelectedUserInfo] = useState(null);

  const focusedRank = payload?.overall?.find(row => String(row.userId) === String(focusUserId))?.rank || null;
  const myRow = payload?.overall?.find(row => String(row.userId) === String(selfUserId)) || null;

  const jumpToRank = userId => {
    if (!userId) return;
    const rowId = `rank-row-${String(userId)}`;
    const element = document.getElementById(rowId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("institute-row-focus-pulse");
    setTimeout(() => {
      element.classList.remove("institute-row-focus-pulse");
    }, 2200);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [leaderboardRes, friendsRes] = await Promise.all([
          API.get("/institution/me/leaderboard", headers),
          API.get("/friends", headers).catch(() => ({ data: {} }))
        ]);
        setPayload(leaderboardRes.data || null);
        setRelationByUser(buildFriendRelationMap(friendsRes.data || {}));
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load ranking.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!focusUserId || !payload?.overall?.length) return;
    const myRow = payload.overall.find(row => String(row.userId) === String(focusUserId));
    if (!myRow) return;
    const timer = setTimeout(() => {
      jumpToRank(focusUserId);
    }, 120);

    return () => clearTimeout(timer);
  }, [payload?.overall, focusUserId]);

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

  if (loading) return <p>Loading ranking...</p>;
  if (!payload?.linked) {
    return (
      <div className="institute-shell">
        <div className="institute-page">
          <div className="institute-header">
            <h2>Institution Ranking</h2>
            <p>Institution mode is not linked for this account.</p>
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
          <h2>{payload.institution?.name} Ranking</h2>
          <p>Code: {payload.institution?.code}</p>
          <p className="institute-muted">
            Your Rank: {focusedRank ? `#${focusedRank}` : "Not in leaderboard"}
            {myRow ? ` | Tier: ${rankTierLabel(myRow.rank)}` : ""}
          </p>
          <div className="institute-actions">
            <button className="institute-btn small" onClick={() => jumpToRank(selfUserId)}>
              Show My Rank
            </button>
          </div>
        </div>

        <div className="institute-card">
          <div className="institute-info-head">
            <h3>Overall Leaderboard</h3>
            <button className="institute-btn small" onClick={() => jumpToRank(selfUserId)}>
              Go To My Row
            </button>
          </div>
          {!payload.overall?.length && <p className="institute-muted">No ranking data available.</p>}
          {!!payload.overall?.length && (
            <div className="institute-table-wrap">
              <table className="institute-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Contest Points</th>
                    <th>Pass Rate</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Avg Rank</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.overall.map((row, idx) => {
                    const rowId = String(row.userId);
                    const isSelf = rowId === String(selfUserId);
                    const relation = relationByUser[rowId] || "none";
                    const relationLabel = relationButtonLabel(relation, isSelf);
                    const relationDisabled = relation !== "none" || friendLoadingId === rowId;
                    return (
                      <tr
                        key={`${row.userId}-${idx}`}
                        id={`rank-row-${rowId}`}
                        className={rowId === focusUserId ? "institute-row-focus" : ""}
                      >
                        <td>
                          <span className={`institute-rank-badge rank-${row.rank <= 3 ? row.rank : "other"}`}>
                            #{row.rank}
                          </span>
                        </td>
                        <td>{row.name}</td>
                        <td>{row.department || row.stream || "General"}</td>
                        <td>{row.totalContestPoints}</td>
                        <td>{row.highestPassRate ?? row.accuracy}%</td>
                        <td>{row.wins}</td>
                        <td>{row.losses}</td>
                        <td>{row.averageRank}</td>
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
          <h3>Department-wise</h3>
          {!payload.departmentWise?.length && <p className="institute-muted">No department split available.</p>}
          {(payload.departmentWise || []).map(group => (
            <div key={group.department} className="institute-group">
              <h4>{group.department}</h4>
              <div className="institute-department-list">
                {(group.leaderboard || []).map((item, idx) => (
                  <div key={`${group.department}-${item.userId}-${idx}`} className="institute-department-row">
                    <span className="institute-rank-badge rank-other">#{item.departmentRank}</span>
                    <span>{item.name}</span>
                    <span>{item.totalContestPoints} pts</span>
                    <span>Wins: {item.wins || 0}</span>
                    <span>Pass: {item.highestPassRate ?? item.accuracy}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="institute-actions">
          <button className="institute-btn" onClick={() => navigate("/institution")}>Institution</button>
          <button className="institute-btn" onClick={() => navigate("/home")}>Home</button>
        </div>
        {!!message && <p className="institute-note">{message}</p>}
      </div>
    </div>
  );
}

export default InstitutionRanking;
