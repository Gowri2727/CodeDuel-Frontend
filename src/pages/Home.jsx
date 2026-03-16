// function Home() {
//   return (
//     <div className="container">
//       <h1>Welcome to Code Duel</h1>
//       <button onClick={() => {
//         localStorage.removeItem("token");
//         localStorage.removeItem("userId");
//         window.location.href = "/";
//       }}>
//         Logout
//       </button>
//     </div>
//   );
// }

// export default Home;
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import "./Home.css";
import "../styles/home-modes.css";
import Footer from "../components/Footer";
import CrossedSwordsIcon from "../components/CrossedSwordsIcon";
import {
  buildRoomAutoJoinPath,
  clearPendingRoomAutoJoin,
  getPendingRoomAutoJoin
} from "../utils/roomInviteAutoJoin";

function Home() {
  const navigate = useNavigate();
  const [homeNotice, setHomeNotice] = useState("");
  const [contestAlerts, setContestAlerts] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifActionId, setNotifActionId] = useState("");
  const [messageAlerts, setMessageAlerts] = useState([]);
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const isLoggedIn = Boolean(token && userId);
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const openProtectedRoute = path => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: path } });
      return;
    }
    navigate(path);
  };

  const loadContestAlerts = async () => {
    if (!token) return;
    try {
      setNotifLoading(true);
      const res = await API.get("/institution/me/contests", headers);
      const contests = Array.isArray(res.data?.contests) ? res.data.contests : [];
      const alerts = contests
        .filter(item => item.status === "scheduled" || item.status === "live")
        .filter(item => Boolean(item.canEnroll) || String(item.myEnrollmentStatus || "") === "registered")
        .slice(0, 8);
      setContestAlerts(alerts);
    } catch {
      setContestAlerts([]);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const mediaQueries = [
      window.matchMedia("(max-width: 840px)"),
      window.matchMedia("(max-height: 860px)")
    ];

    const syncScrollMode = () => {
      const shouldAllowScroll = mediaQueries.some(query => query.matches);
      if (shouldAllowScroll) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousHtmlOverflow;
        document.body.classList.remove("home-scroll-lock");
        document.documentElement.classList.remove("home-scroll-lock");
        return;
      }

      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      document.body.classList.add("home-scroll-lock");
      document.documentElement.classList.add("home-scroll-lock");
    };

    syncScrollMode();
    mediaQueries.forEach(query => query.addEventListener("change", syncScrollMode));

    return () => {
      mediaQueries.forEach(query => query.removeEventListener("change", syncScrollMode));
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.classList.remove("home-scroll-lock");
      document.documentElement.classList.remove("home-scroll-lock");
    };
  }, []);

  useEffect(() => {
    const pending = getPendingRoomAutoJoin();
    if (!pending?.roomCode) return;
    clearPendingRoomAutoJoin();
    navigate(buildRoomAutoJoinPath(pending.roomCode), { replace: true });
  }, [navigate]);

  useEffect(() => {
    loadContestAlerts();
    const intervalId = setInterval(() => {
      loadContestAlerts();
    }, 15000);
    return () => clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    const roomRemovalNotice = sessionStorage.getItem("room_removed_notice");
    if (!roomRemovalNotice) return;
    setHomeNotice(roomRemovalNotice);
    sessionStorage.removeItem("room_removed_notice");
    const timer = setTimeout(() => setHomeNotice(""), 3500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onFriendMessage = payload => {
      if (!payload?.receiverId || !payload?._id) return;
      if (String(payload.receiverId) !== String(userId)) return;
      if (String(payload.senderId || "") === String(userId)) return;
      setMessageAlerts(prev => {
        const exists = prev.some(item => String(item._id) === String(payload._id));
        if (exists) return prev;
        return [
          {
            _id: String(payload._id),
            senderId: String(payload.senderId || ""),
            senderName: String(payload.senderName || "User"),
            createdAt: payload.createdAt || new Date().toISOString(),
            text: String(payload.text || "")
          },
          ...prev
        ].slice(0, 8);
      });
    };
    socket.on("friend-message", onFriendMessage);
    return () => socket.off("friend-message", onFriendMessage);
  }, [userId]);

  const enrollAndOpen = async contestId => {
    if (!contestId) return;
    try {
      setNotifActionId(String(contestId));
      await API.post(`/institution/contests/${contestId}/enroll`, {}, headers);
      await loadContestAlerts();
      navigate(`/institution/duel/${contestId}`);
    } catch {
      navigate("/institution");
    } finally {
      setNotifActionId("");
    }
  };

  const totalNotifCount = contestAlerts.length + messageAlerts.length;

  return (
    <div className="home-page">
      <nav className="home-nav">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            <CrossedSwordsIcon
              size={24}
              color="#dffef1"
              strokeWidth={1.2}
              shadow={1}
            />
          </span>
          Code Duel
        </div>

        <div className="nav-links">
          <button className="nav-link" onClick={() => openProtectedRoute("/solo")}>
            Solo
          </button>
          <button className="nav-link" onClick={() => openProtectedRoute("/random")}>
            Random
          </button>
          <button className="nav-link" onClick={() => openProtectedRoute("/room")}>
            Room
          </button>
          <button className="nav-link" onClick={() => openProtectedRoute("/friends")}>
            Friends
          </button>
          <button
            className="nav-link"
            onClick={() => openProtectedRoute("/institution")}
          >
            Institution
          </button>
          <button className="nav-link" onClick={() => openProtectedRoute("/region")}>
            Region
          </button>
        </div>

        <div className="nav-actions">
          {isLoggedIn ? (
            <>
              <div className="home-notif-wrap">
                <button
                  className="profile-icon home-notif-btn"
                  onClick={() => setNotifOpen(prev => !prev)}
                  aria-label="Institution notifications"
                  title="Institution notifications"
                >
                  <span className="home-bell" aria-hidden="true" />
                  {totalNotifCount > 0 && <span className="home-notif-count">{totalNotifCount}</span>}
                </button>
                {notifOpen && (
                  <div className="home-notif-panel">
                    <p className="home-notif-title">Messages</p>
                    {!messageAlerts.length && <p className="home-notif-muted">No new messages.</p>}
                    {messageAlerts.map(item => (
                      <div key={item._id} className="home-notif-item">
                        <p className="home-notif-name">{item.senderName} messaged you</p>
                        <p className="home-notif-meta">{new Date(item.createdAt).toLocaleString()}</p>
                        <div className="home-notif-actions">
                          <button
                            className="primary"
                            onClick={() => {
                              setNotifOpen(false);
                              setMessageAlerts([]);
                              navigate("/friends");
                            }}
                          >
                            Open Friends
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="section-divider" />
                    <p className="home-notif-title">Institution Contests</p>
                    {notifLoading && <p className="home-notif-muted">Loading...</p>}
                    {!notifLoading && !contestAlerts.length && (
                      <p className="home-notif-muted">No new contest alerts.</p>
                    )}
                    {!notifLoading && contestAlerts.map(item => (
                      <div key={item._id} className="home-notif-item">
                        <p className="home-notif-name">{item.title}</p>
                        <p className="home-notif-meta">{item.status} | {item.difficulty} | {item.type}</p>
                        <div className="home-notif-actions">
                          {item.canEnroll && (
                            <button
                              className="ghost"
                              onClick={() => enrollAndOpen(item._id)}
                              disabled={notifActionId === String(item._id)}
                            >
                              {notifActionId === String(item._id) ? "Enrolling..." : "Enroll"}
                            </button>
                          )}
                          {String(item.myEnrollmentStatus || "") === "registered" && (
                            <button className="primary" onClick={() => navigate(`/institution/duel/${item._id}`)}>
                              Open
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="profile-icon"
                onClick={() => navigate("/profile")}
                aria-label="Open profile"
                title="Profile"
              >
                <span className="profile-glyph" aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className="home-auth-actions">
              <button className="ghost home-auth-btn" onClick={() => navigate("/login")}>
                Login
              </button>
              <button className="primary home-auth-btn" onClick={() => navigate("/register")}>
                Signup
              </button>
            </div>
          )}
        </div>
      </nav>

      {!!homeNotice && <p className="home-notice">{homeNotice}</p>}

      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Practice - Compete - Improve</p>
          <h1>Welcome to Code Duel</h1>
          <p className="subtext">
            Understand different coding approaches, learn from mistakes, and become a better programmer.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => openProtectedRoute("/solo")}>
              Start Solo
            </button>
            <button className="secondary" onClick={() => openProtectedRoute("/random")}>
              Find Random Duel
            </button>
          </div>
        </div>

        <div className="hero-card">
          <h3>Today's Flow</h3>
          <div className="hero-stats">
            <div>
              <span className="stat">15m</span>
              <span className="label">Warmup</span>
            </div>
            <div>
              <span className="stat">3</span>
              <span className="label">Challenges</span>
            </div>
            <div>
              <span className="stat">1</span>
              <span className="label">Duel</span>
            </div>
          </div>
          <button className="primary" onClick={() => openProtectedRoute("/room")}>
            Create Room
          </button>
        </div>
      </header>

      <section className="mode-grid">
        <div className="mode-card solo-duel">
          <h3>Solo Mode</h3>
          <p>Focused practice with curated problems.</p>
          <button className="ghost" onClick={() => openProtectedRoute("/solo")}>
            Enter Solo
          </button>
        </div>
        <div className="mode-card random-duel">
          <h3>Random Duel</h3>
          <p>Instant matchmaking for quick battles.</p>
          <button className="ghost" onClick={() => openProtectedRoute("/random")}>
            Start Duel
          </button>
        </div>
        <div className="mode-card room-duel">
          <h3>Room Duel</h3>
          <p>Create or join a private room with code.</p>
          <button className="ghost" onClick={() => openProtectedRoute("/room")}>
            Join Room
          </button>
        </div>
        <div className="mode-card friend-duel">
          <h3>Friends</h3>
          <p>Challenge friends and track progress.</p>
          <button className="ghost" onClick={() => openProtectedRoute("/friends")}>
            Open Friends
          </button>
        </div>
        <div className="mode-card institute-duel">
          <h3>Institution</h3>
          <p>Compete with classmates in shared arenas.</p>
          <button className="ghost" onClick={() => openProtectedRoute("/institution")}>
            View Institutions
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default Home;
