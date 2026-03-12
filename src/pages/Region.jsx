import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import "../styles/institute.css";

function rankTierLabel(rank) {
  const safeRank = Number(rank || 0);
  if (safeRank === 1) return "Grandmaster";
  if (safeRank <= 3) return "Elite";
  if (safeRank <= 10) return "Diamond";
  if (safeRank <= 25) return "Platinum";
  return "Challenger";
}

function Region() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const selfUserId = localStorage.getItem("userId");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState(null);

  const topPlayers = (payload?.overall || []).slice(0, 3);
  const myRow = payload?.overall?.find(row => String(row.userId) === String(selfUserId)) || null;

  const jumpToRank = userId => {
    if (!userId) return;
    const element = document.getElementById(`region-rank-row-${String(userId)}`);
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
        const res = await API.get("/institution/region/leaderboard", headers);
        setPayload(res.data || null);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load regional ranking.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <p>Loading region ranking...</p>;

  if (!payload?.overall) {
    return (
      <div className="institute-shell">
        <div className="institute-page">
          <div className="institute-header">
            <h2>Region Ranking</h2>
            <p>Regional ranking is unavailable right now.</p>
          </div>
          <div className="institute-actions">
            <button className="institute-btn" onClick={() => navigate("/home")}>Home</button>
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
          <h2>Region Ranking</h2>
          <p className="institute-muted">
            Your Rank: {myRow ? `#${myRow.rank}` : "Not in leaderboard"}
            {myRow ? ` | Tier: ${rankTierLabel(myRow.rank)}` : ""}
          </p>
          <div className="institute-actions">
            <button className="institute-btn small" onClick={() => jumpToRank(selfUserId)}>Show My Rank</button>
          </div>
        </div>

        {!!topPlayers.length && (
          <div className="institute-card">
            <h3>Regional Podium</h3>
            <div className="institute-podium-grid">
              {topPlayers.map(player => (
                <div key={`region-podium-${player.userId}`} className={`institute-podium-card rank-${player.rank}`}>
                  <p className="institute-podium-rank">#{player.rank}</p>
                  <p className="institute-podium-name">{player.name}</p>
                  <p className="institute-muted">{rankTierLabel(player.rank)}</p>
                  <p className="institute-muted">{player.totalContestPoints} pts | Wins: {player.wins || 0}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="institute-card">
          <h3>Leaderboard</h3>
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
                  </tr>
                </thead>
                <tbody>
                  {payload.overall.map((row, idx) => (
                    <tr
                      key={`${row.userId}-${idx}`}
                      id={`region-rank-row-${row.userId}`}
                      className={String(row.userId) === String(selfUserId) ? "institute-row-focus" : ""}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="institute-actions">
          <button className="institute-btn" onClick={() => navigate("/home")}>Home</button>
        </div>
        {!!message && <p className="institute-note">{message}</p>}
      </div>
    </div>
  );
}

export default Region;
