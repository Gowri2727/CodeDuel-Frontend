import { useEffect, useState } from "react";
import API from "../services/api";
import "../styles/profile.css";

function zeroBucket() {
  return { easy: 0, medium: 0, hard: 0, total: 0 };
}

function Profile() {
  const [user, setUser] = useState(null);
  const [edit, setEdit] = useState(false);

  const token = localStorage.getItem("token");

  useEffect(() => {
    API.get("/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      const payload = res.data || {};
      setUser({
        ...payload,
        bio: payload.bio || "",
        college: payload.college || "",
        course: payload.course || "",
        stream: payload.stream || "",
        portfolioLinks: {
          github: payload.portfolioLinks?.github || "",
          website: payload.portfolioLinks?.website || "",
          linkedin: payload.portfolioLinks?.linkedin || ""
        }
      });
    });
  }, []);

  const saveProfile = async () => {
    await API.put("/users/me", user, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setEdit(false);
  };

  if (!user) return <p>Loading...</p>;

  const stats = user.soloSubmissionStats || {};
  const dsa = stats.dsa || zeroBucket();
  const normal = stats.normal || zeroBucket();
  const passRate = (stats.total || 0) > 0 ? Number((((stats.passed || 0) / stats.total) * 100).toFixed(2)) : 0;
  const duel = user.duelOutcomeStats || {};
  const initials = String(user.name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "U";
  const languagesDisplay = Array.isArray(user.languages) ? user.languages.filter(Boolean) : [];

  return (
    <div className="profile-shell">
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-identity">
            <div className="profile-avatar">{initials}</div>
            <div>
              <h2>{user.name || "User Profile"}</h2>
              <p>{user.email}</p>
            </div>
          </div>
          <span className={`profile-mode-chip ${edit ? "profile-mode-chip-edit" : ""}`}>
            {edit ? "Editing" : "View Mode"}
          </span>
        </div>

        <div className="profile-subhead">
          <p>Manage account settings and track your coding progress.</p>
          {!!languagesDisplay.length && (
            <div className="profile-lang-row">
              {languagesDisplay.map(lang => (
                <span key={lang} className="profile-lang-chip">{lang}</span>
              ))}
            </div>
          )}
        </div>

        <div className="profile-grid">
          <label className="profile-field">
            <span>Name</span>
            <input
              value={user.name}
              disabled={!edit}
              onChange={e => setUser({ ...user, name: e.target.value })}
            />
          </label>

          <label className="profile-field">
            <span>Languages</span>
            <input
              value={Array.isArray(user.languages) ? user.languages.join(", ") : ""}
              disabled={!edit}
              onChange={e => setUser({
                ...user,
                languages: e.target.value.split(",").map(item => item.trim()).filter(Boolean)
              })}
            />
          </label>

          <label className="profile-field">
            <span>Institution Code</span>
            <input
              value={user.institutionCode || ""}
              disabled={!edit}
              placeholder="Institution Code"
              onChange={e => setUser({ ...user, institutionCode: e.target.value })}
            />
          </label>

          <label className="profile-field">
            <span>College</span>
            <input
              value={user.college || ""}
              disabled={!edit}
              placeholder="Your college name"
              onChange={e => setUser({ ...user, college: e.target.value })}
            />
          </label>

          <label className="profile-field">
            <span>Course</span>
            <input
              value={user.course || ""}
              disabled={!edit}
              placeholder="B.Tech / B.Sc / M.Tech ..."
              onChange={e => setUser({ ...user, course: e.target.value })}
            />
          </label>

          <label className="profile-field">
            <span>Stream</span>
            <input
              value={user.stream || ""}
              disabled={!edit}
              placeholder="CSE / ECE / AIML ..."
              onChange={e => setUser({ ...user, stream: e.target.value })}
            />
          </label>

          <label className="profile-field profile-field-wide">
            <span>Bio</span>
            <textarea
              value={user.bio || ""}
              disabled={!edit}
              placeholder="Write a short bio..."
              onChange={e => setUser({ ...user, bio: e.target.value })}
              rows={4}
            />
          </label>

          <label className="profile-field">
            <span>GitHub URL</span>
            <input
              value={user.portfolioLinks?.github || ""}
              disabled={!edit}
              placeholder="https://github.com/username"
              onChange={e => setUser({
                ...user,
                portfolioLinks: { ...(user.portfolioLinks || {}), github: e.target.value }
              })}
            />
          </label>

          <label className="profile-field">
            <span>Portfolio / Website URL</span>
            <input
              value={user.portfolioLinks?.website || ""}
              disabled={!edit}
              placeholder="https://yourwebsite.com"
              onChange={e => setUser({
                ...user,
                portfolioLinks: { ...(user.portfolioLinks || {}), website: e.target.value }
              })}
            />
          </label>

          <label className="profile-field">
            <span>LinkedIn URL</span>
            <input
              value={user.portfolioLinks?.linkedin || ""}
              disabled={!edit}
              placeholder="https://linkedin.com/in/username"
              onChange={e => setUser({
                ...user,
                portfolioLinks: { ...(user.portfolioLinks || {}), linkedin: e.target.value }
              })}
            />
          </label>

        </div>

        <div className="profile-kpi-grid">
          <div className="profile-kpi-card"><span>Level</span><strong>{user.level}</strong></div>
          <div className="profile-kpi-card"><span>Solved</span><strong>{user.solvedCount}</strong></div>
          <div className="profile-kpi-card"><span>Points</span><strong>{user.points || 0}</strong></div>
          <div className="profile-kpi-card"><span>Submissions</span><strong>{stats.total || 0}</strong></div>
          <div className="profile-kpi-card"><span>Passed</span><strong>{stats.passed || 0}</strong></div>
          <div className="profile-kpi-card"><span>Pass Rate</span><strong>{passRate}%</strong></div>
          <div className="profile-kpi-card"><span>Duel Passed</span><strong>{duel.passed || 0}</strong></div>
          <div className="profile-kpi-card"><span>Duel Failed</span><strong>{duel.failed || 0}</strong></div>
          <div className="profile-kpi-card"><span>Losses</span><strong>{duel.losses || 0}</strong></div>
          <div className="profile-kpi-card"><span>AFK / Forfeit</span><strong>{(duel.afk || 0) + (duel.forfeits || 0)}</strong></div>
        </div>

        <div className="profile-progress-card">
          <div className="profile-progress-head">
            <span>Overall Pass Rate</span>
            <strong>{passRate}%</strong>
          </div>
          <div className="profile-progress-track">
            <div className="profile-progress-fill" style={{ width: `${Math.min(passRate, 100)}%` }} />
          </div>
        </div>

        <div className="profile-stats-card">
          <h3>Solo Submission Stats</h3>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Easy</th>
                <th>Medium</th>
                <th>Hard</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>DSA</td>
                <td>{dsa.easy}</td>
                <td>{dsa.medium}</td>
                <td>{dsa.hard}</td>
                <td>{dsa.total}</td>
              </tr>
              <tr>
                <td>Normal</td>
                <td>{normal.easy}</td>
                <td>{normal.medium}</td>
                <td>{normal.hard}</td>
                <td>{normal.total}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="profile-actions">
          {!edit ? (
            <button className="profile-btn" onClick={() => setEdit(true)}>Edit</button>
          ) : (
            <button className="profile-btn" onClick={saveProfile}>Save</button>
          )}

          <button
            className="profile-btn profile-logout"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("userId");
              localStorage.removeItem("role");
              window.location.href = "/";
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;
