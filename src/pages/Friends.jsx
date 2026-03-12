import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import socket from "../services/socket";
import "../styles/friends.css";

function relationLabel(relation) {
  if (relation === "friend") return "Already Friend";
  if (relation === "outgoing_pending") return "Request Sent";
  if (relation === "incoming_pending") return "Accept Pending";
  return "Request Not Sent";
}

function Friends() {
  const navigate = useNavigate();
  const userId = localStorage.getItem("userId");
  const [data, setData] = useState({ friends: [], receivedRequests: [], sentRequests: [] });
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [userModes, setUserModes] = useState({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searching, setSearching] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [activeChatFriend, setActiveChatFriend] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  const token = localStorage.getItem("token");
  const headers = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const showMessage = (text) => {
    setActionMessage(text);
    setTimeout(() => setActionMessage(""), 1700);
  };

  const load = async () => {
    const res = await API.get("/friends", headers);
    setData(res.data || { friends: [], receivedRequests: [], sentRequests: [] });
  };

  const runSearch = async (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await API.get(`/users/search?q=${encodeURIComponent(trimmed)}`, headers);
      setSearchResults(Array.isArray(res.data) ? res.data : []);
    } finally {
      setSearching(false);
    }
  };

  const loadChatMessages = async (friendId, { silent = false } = {}) => {
    if (!friendId) {
      setChatMessages([]);
      return;
    }
    try {
      if (!silent) setChatLoading(true);
      const res = await API.get(`/friends/messages/${friendId}`, headers);
      setChatMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
    } catch (err) {
      showMessage(err?.response?.data?.message || "Unable to load chat messages.");
    } finally {
      if (!silent) setChatLoading(false);
    }
  };

  useEffect(() => {
    load();
    const announceOnline = () => {
      if (userId) {
        socket.emit("user-online", userId);
      }
    };
    const onOnlineUsers = users => {
      setOnlineUsers(users || []);
    };
    const onUserModeSnapshot = snap => {
      setUserModes(snap || {});
    };
    const onUserModeUpdate = payload => {
      if (!payload?.userId) return;
      setUserModes(prev => ({
        ...prev,
        [String(payload.userId)]: payload
      }));
    };
    const onFriendRefresh = () => {
      load();
      showMessage("New friend activity updated.");
    };
    const onFriendMessage = payload => {
      if (!payload?.senderId || !payload?.receiverId) return;
      const mine = String(payload.senderId) === String(userId) || String(payload.receiverId) === String(userId);
      if (!mine) return;
      if (activeChatFriend) {
        const isCurrent = String(payload.senderId) === String(activeChatFriend)
          || String(payload.receiverId) === String(activeChatFriend);
        if (!isCurrent) return;
      }
      setChatMessages(prev => {
        const exists = prev.some(item => String(item._id) === String(payload._id));
        if (exists) return prev;
        return [...prev, payload];
      });
    };

    socket.on("online-users", onOnlineUsers);
    socket.on("user-mode-snapshot", onUserModeSnapshot);
    socket.on("user-mode-update", onUserModeUpdate);
    socket.on("friend-refresh", onFriendRefresh);
    socket.on("friend-message", onFriendMessage);
    socket.on("connect", announceOnline);
    announceOnline();

    const refreshId = setInterval(() => {
      load();
    }, 5000);

    const onFocus = () => {
      load();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      socket.off("online-users", onOnlineUsers);
      socket.off("user-mode-snapshot", onUserModeSnapshot);
      socket.off("user-mode-update", onUserModeUpdate);
      socket.off("friend-refresh", onFriendRefresh);
      socket.off("friend-message", onFriendMessage);
      socket.off("connect", announceOnline);
      clearInterval(refreshId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!activeChatFriend) return;
    loadChatMessages(activeChatFriend);
    const refreshId = setInterval(() => {
      loadChatMessages(activeChatFriend, { silent: true });
    }, 4000);
    return () => clearInterval(refreshId);
  }, [activeChatFriend]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const resolveMode = id => String(userModes?.[String(id)]?.mode || "");

  const isOnline = id => {
    const onlineBySocket = (onlineUsers || []).some(item => {
      if (item === null || item === undefined) return false;
      if (typeof item === "string" || typeof item === "number") {
        return String(item) === String(id);
      }
      const mappedId = item.userId || item._id || item.id || "";
      return String(mappedId) === String(id);
    });
    const mode = resolveMode(id);
    return onlineBySocket || Boolean(mode && mode !== "offline");
  };

  const presenceLabel = id => {
    const mode = resolveMode(id);
    if (!isOnline(id)) return "offline";
    if (!mode || mode === "idle") return "online";
    return mode.replace(/_/g, " ");
  };

  const acceptRequest = async (userId) => {
    try {
      await API.post("/friends/accept", { userId }, headers);
      showMessage("Friend request accepted.");
      load();
      runSearch(query);
    } catch (err) {
      showMessage(err?.response?.data?.message || "Unable to accept request.");
    }
  };

  const rejectRequest = async (userId) => {
    try {
      await API.post("/friends/reject", { userId }, headers);
      showMessage("Friend request rejected.");
      load();
      runSearch(query);
    } catch (err) {
      showMessage(err?.response?.data?.message || "Unable to reject request.");
    }
  };

  const sendRequest = async (user) => {
    const relation = user?.relation || "none";
    if (relation === "friend") {
      showMessage("Already friends.");
      return;
    }
    if (relation === "outgoing_pending") {
      showMessage("Friend request already sent.");
      return;
    }
    if (relation === "incoming_pending") {
      showMessage("This user already sent you a request. Accept it from requests.");
      return;
    }

    try {
      const res = await API.post("/friends/send", { userId: user._id }, headers);
      showMessage(res?.data?.message || "Friend request sent.");
      socket.emit("friend-notify", { targetUserId: user._id });
      await Promise.all([load(), runSearch(query)]);
      if (selectedUser && String(selectedUser._id) === String(user._id)) {
        setSelectedUser(prev => ({ ...prev, relation: "outgoing_pending" }));
      }
    } catch (err) {
      showMessage(err?.response?.data?.message || "Unable to send friend request.");
    }
  };

  const cancelRequest = async (userId) => {
    try {
      await API.post("/friends/cancel", { userId }, headers);
      showMessage("Friend request cancelled.");
      await Promise.all([load(), runSearch(query)]);
      if (selectedUser && String(selectedUser._id) === String(userId)) {
        setSelectedUser(prev => ({ ...prev, relation: "none" }));
      }
    } catch (err) {
      showMessage(err?.response?.data?.message || "Unable to cancel request.");
    }
  };

  const removeFriend = async (targetUserId) => {
    try {
      await API.post("/friends/remove", { userId: targetUserId }, headers);
      showMessage("Friend removed.");
      if (selectedUser && String(selectedUser._id) === String(targetUserId)) {
        setSelectedUser(null);
      }
      await Promise.all([load(), runSearch(query)]);
    } catch (err) {
      showMessage(err?.response?.data?.message || "Unable to remove friend.");
    }
  };

  const openUserInfo = async (userId) => {
    const res = await API.get(`/users/${userId}`, headers);
    setSelectedUser(res.data);
  };

  const openChat = friend => {
    if (!friend?._id) return;
    setActiveChatFriend(String(friend._id));
    setChatText("");
  };

  const sendChatMessage = async () => {
    if (!activeChatFriend) return;
    const safeText = String(chatText || "").trim();
    if (!safeText) return;
    try {
      setChatSending(true);
      const res = await API.post(`/friends/messages/${activeChatFriend}`, { text: safeText }, headers);
      const saved = res.data?.data;
      if (saved?._id) {
        setChatMessages(prev => {
          const exists = prev.some(item => String(item._id) === String(saved._id));
          if (exists) return prev;
          return [...prev, saved];
        });
      } else {
        await loadChatMessages(activeChatFriend);
      }
      setChatText("");
    } catch (err) {
      showMessage(err?.response?.data?.message || "Unable to send message.");
    } finally {
      setChatSending(false);
    }
  };

  const searchVisible = Boolean(query.trim()) || searching || searchResults.length > 0;

  return (
    <div className="friends-shell">
      <div className="friends-card">
        <div className="friends-topbar">
          <div>
            <h2>Friends Hub</h2>
            <p>Find users, review profiles, and manage friend requests.</p>
          </div>
          <button className="friends-ghost-btn" onClick={() => navigate("/home")}>Home</button>
        </div>

        {!!actionMessage && <p className="friends-note">{actionMessage}</p>}

        <section className="friends-search-panel friends-search-top">
          <h3>Search Users</h3>
          <div className="friends-search-row">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name..."
            />
            <button className="friends-ghost-btn" onClick={() => runSearch(query)}>Search</button>
          </div>
          {searching && <p className="friends-muted">Searching...</p>}
          {!searching && query.trim() && !searchResults.length && (
            <p className="friends-muted">No matching users found.</p>
          )}

          {searchVisible && (
            <div className="friends-results">
              {searchResults.map((user, idx) => (
                <div key={`${user._id}-${idx}`} className="friends-result-card">
                  <div>
                    <p className="friends-user-name">{user.name}</p>
                    <p className="friends-user-meta">
                      Level {user.level} | {user.points} pts | Solved {user.solvedCount}
                    </p>
                    <p className="friends-user-meta">{relationLabel(user.relation)}</p>
                  </div>
                  <div className="friends-item-actions">
                    <button
                      className="friends-icon-btn friends-info"
                      title="User Info"
                      onClick={() => openUserInfo(user._id)}
                    >
                      i
                    </button>
                    {user.relation === "outgoing_pending" ? (
                      <button
                        className="friends-icon-btn friends-reject"
                        title="Cancel Friend Request"
                        onClick={() => cancelRequest(user._id)}
                      >
                        c
                      </button>
                    ) : (
                      <button
                        className="friends-icon-btn friends-send"
                        title="Send Friend Request"
                        onClick={() => sendRequest(user)}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="friends-grid">
          <section className={`friends-panel ${data.receivedRequests?.length ? "friends-panel-active" : ""}`}>
            <h3>Incoming Requests ({data.receivedRequests?.length || 0})</h3>
            {!data.receivedRequests?.length && <p className="friends-muted">No pending requests.</p>}
            {data.receivedRequests?.map((user, idx) => (
              <div key={`${user._id}-${idx}`} className="friends-item">
                <span className="friends-online-wrap">
                  <i className={`friends-dot ${isOnline(user._id) ? "online" : "offline"}`} />
                  {user.name}
                  <small className="friends-presence-label">{presenceLabel(user._id)}</small>
                </span>
                <div className="friends-item-actions">
                  <button
                    className="friends-icon-btn friends-info"
                    title="User Info"
                    onClick={() => openUserInfo(user._id)}
                  >
                    i
                  </button>
                  <button
                    className="friends-icon-btn friends-accept"
                    title="Accept"
                    onClick={() => acceptRequest(user._id)}
                  >
                    ok
                  </button>
                  <button
                    className="friends-icon-btn friends-reject"
                    title="Reject"
                    onClick={() => rejectRequest(user._id)}
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="friends-panel">
            <h3>Sent Requests ({data.sentRequests?.length || 0})</h3>
            {!data.sentRequests?.length && <p className="friends-muted">No sent requests.</p>}
            {data.sentRequests?.map((user, idx) => (
              <div key={`${user._id}-${idx}`} className="friends-item">
                <span className="friends-online-wrap">
                  <i className={`friends-dot ${isOnline(user._id) ? "online" : "offline"}`} />
                  {user.name}
                  <small className="friends-presence-label">{presenceLabel(user._id)}</small>
                </span>
                <div className="friends-item-actions">
                  <button
                    className="friends-icon-btn friends-info"
                    title="User Info"
                    onClick={() => openUserInfo(user._id)}
                  >
                    i
                  </button>
                  <button
                    className="friends-icon-btn friends-reject"
                    title="Cancel Request"
                    onClick={() => cancelRequest(user._id)}
                  >
                    c
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="friends-panel">
            <h3>Your Friends</h3>
            {!data.friends?.length && <p className="friends-muted">No friends yet.</p>}
            {data.friends?.map((user, idx) => (
              <div key={`${user._id}-${idx}`} className="friends-item">
                <span className="friends-online-wrap">
                  <i className={`friends-dot ${isOnline(user._id) ? "online" : "offline"}`} />
                  {user.name}
                  <small className="friends-presence-label">{presenceLabel(user._id)}</small>
                </span>
                <div className="friends-item-actions">
                  <button
                    className="friends-icon-btn friends-info"
                    title="User Info"
                    onClick={() => openUserInfo(user._id)}
                  >
                    i
                  </button>
                  <button
                    className="friends-icon-btn friends-reject"
                    title="Remove Friend"
                    onClick={() => removeFriend(user._id)}
                  >
                    -
                  </button>
                  <button
                    className="friends-icon-btn friends-send"
                    title="Open Chat"
                    onClick={() => openChat(user)}
                  >
                    chat
                  </button>
                </div>
              </div>
            ))}
          </section>
        </div>

        {!!activeChatFriend && (
          <section className="friends-user-info">
            <div className="friends-info-head">
              <h3>
                Chat with {data.friends?.find(item => String(item._id) === String(activeChatFriend))?.name || "Friend"}
              </h3>
              <button className="friends-icon-btn friends-reject" onClick={() => setActiveChatFriend(null)}>x</button>
            </div>
            <div className="friends-chat-box">
              {chatLoading && <p className="friends-muted">Loading messages...</p>}
              {!chatLoading && !chatMessages.length && <p className="friends-muted">No messages yet.</p>}
              {!chatLoading && chatMessages.map(item => {
                const mine = String(item.senderId) === String(userId);
                return (
                  <div key={item._id} className={`friends-chat-message ${mine ? "mine" : "other"}`}>
                    <p className="friends-chat-text">{item.text}</p>
                    <p className="friends-chat-time">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
            <div className="friends-chat-row">
              <input
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    sendChatMessage();
                  }
                }}
              />
              <button className="friends-ghost-btn" onClick={sendChatMessage} disabled={chatSending}>
                {chatSending ? "Sending..." : "Send"}
              </button>
            </div>
          </section>
        )}

        {!!selectedUser && (
          <section className="friends-user-info">
            <div className="friends-info-head">
              <h3>User Info</h3>
              <button className="friends-icon-btn friends-reject" onClick={() => setSelectedUser(null)}>x</button>
            </div>
            <p><strong>Name:</strong> {selectedUser.name}</p>
            <p><strong>Email:</strong> {selectedUser.email}</p>
            <p><strong>Level:</strong> {selectedUser.level}</p>
            <p><strong>Points:</strong> {selectedUser.points}</p>
            <p><strong>Solved:</strong> {selectedUser.solvedCount}</p>
            <p><strong>Languages:</strong> {(selectedUser.languages || []).join(", ") || "N/A"}</p>
            <p><strong>College:</strong> {selectedUser.college || "N/A"}</p>
            <p><strong>Course:</strong> {selectedUser.course || "N/A"}</p>
            <p><strong>Stream:</strong> {selectedUser.stream || "N/A"}</p>
            <p><strong>Institution:</strong> {selectedUser.institutionCode || "N/A"}</p>
            <p><strong>Status:</strong> {relationLabel(selectedUser.relation)}</p>
            {!!selectedUser.bio && <p><strong>Bio:</strong> {selectedUser.bio}</p>}
            {!!selectedUser.portfolioLinks?.github && (
              <p><strong>GitHub:</strong> {selectedUser.portfolioLinks.github}</p>
            )}
            {!!selectedUser.portfolioLinks?.website && (
              <p><strong>Website:</strong> {selectedUser.portfolioLinks.website}</p>
            )}
            {!!selectedUser.portfolioLinks?.linkedin && (
              <p><strong>LinkedIn:</strong> {selectedUser.portfolioLinks.linkedin}</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default Friends;
