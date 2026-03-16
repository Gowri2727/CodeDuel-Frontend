// import { BrowserRouter, Routes, Route } from "react-router-dom";
// import { useEffect } from "react";
// import Login from "./pages/Login";
// import Register from "./pages/Register";
// import OAuthSuccess from "./pages/OAuthSuccess";
// import ForgotPassword from "./pages/ForgotPassword";
// import Home from "./pages/Home";
// import Profile from "./pages/Profile";
// import Institution from "./pages/Institution";
// import Friends from "./pages/Friends";
// import socket from "./services/socket";
// import SoloBox from "./pages/SoloBox";
// import RandomBox from "./pages/RandomBox";
// import RoomBox from "./pages/RoomBox";
// import InstituteDashboard from "./pages/InstituteDashboard";
// import InstitutionRanking from "./pages/InstitutionRanking";
// import InstituteRegister from "./pages/InstituteRegister";
// import InstituteLogin from "./pages/InstituteLogin";
// import ProtectedRoute from "./components/ProtectedRoute";
// function App() {
//   useEffect(() => {
//     const userId = localStorage.getItem("userId");
//     if (userId) {
//       socket.emit("user-online", userId);
//     }

//     socket.on("online-users", users => {
//       console.log("Online users:", users);
//     });

//     return () => {
//       socket.off("online-users");
//     };
//   }, []);
//   return (
//     <BrowserRouter>
//       <Routes>
//         <Route path="/" element={<Login />} />
//         <Route path="/register" element={<Register />} />
//         <Route path="/forgot-password" element={<ForgotPassword />} />
//         <Route path="/oauth-success" element={<OAuthSuccess />} />
//         <Route path="/home" element={<Home />} />
//         <Route path="/profile" element={<Profile />} />
//         <Route path="/institution" element={<Institution />} />
//         <Route path="/friends" element={<Friends />} />
//         <Route path="/solo" element={<SoloBox />} />
//         <Route path="/random" element={<RandomBox />} />
//         <Route path="/room" element={<RoomBox />} />
//         <Route path="/institute-dashboard" element={<InstituteDashboard />} />
//         <Route path="/institution-ranking" element={<InstitutionRanking />} />
//         <Route path="/institute-register" element={<InstituteRegister />} />
//         <Route path="/institute-login" element={<InstituteLogin />} />
//         <Route path="/ProtectedRoute" element={<ProtectedRoute />}> </Route>
//       </Routes>
//     </BrowserRouter>
//   );
// }

// export default App;

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";

import Login from "./pages/Login";
import Register from "./pages/Register";
import OAuthSuccess from "./pages/OAuthSuccess";
import ForgotPassword from "./pages/ForgotPassword";

import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Institution from "./pages/Institution";
import Friends from "./pages/Friends";
import SoloBox from "./pages/SoloBox";
import RandomBox from "./pages/RandomBox";
import RoomBox from "./pages/RoomBox";

import InstituteDashboard from "./pages/InstituteDashboard";
import InstitutionRanking from "./pages/InstitutionRanking";
import InstitutionContestDuel from "./pages/InstitutionContestDuel";
import Region from "./pages/Region";
import InstituteRegister from "./pages/InstituteRegister";
import InstituteLogin from "./pages/InstituteLogin";

import ProtectedRoute from "./components/ProtectedRoute";
import socket from "./services/socket";

function App() {
  useEffect(() => {
    const announceOnline = () => {
      const userId = localStorage.getItem("userId");
      if (userId) {
        socket.emit("user-online", userId);
      }
    };

    const onOnlineUsers = users => {
      console.log("Online users:", users);
    };

    announceOnline();
    socket.on("connect", announceOnline);
    socket.on("online-users", onOnlineUsers);

    return () => {
      socket.off("connect", announceOnline);
      socket.off("online-users", onOnlineUsers);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/oauth-success" element={<OAuthSuccess />} />

        {/* USER ROUTES */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute role="user">
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/institution"
          element={
            <ProtectedRoute role="user">
              <Institution />
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <ProtectedRoute role="user">
              <Friends />
            </ProtectedRoute>
          }
        />
        <Route
          path="/solo"
          element={
            <ProtectedRoute role="user">
              <SoloBox />
            </ProtectedRoute>
          }
        />
        <Route
          path="/random"
          element={
            <ProtectedRoute role="user">
              <RandomBox />
            </ProtectedRoute>
          }
        />
        <Route
          path="/room"
          element={
            <ProtectedRoute role="user">
              <RoomBox />
            </ProtectedRoute>
          }
        />

        {/* INSTITUTE ADMIN ROUTES */}
        <Route
          path="/institute-dashboard"
          element={
            <ProtectedRoute role="institute_admin">
              <InstituteDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/institution-ranking"
          element={
            <ProtectedRoute>
              <InstitutionRanking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/region"
          element={
            <ProtectedRoute role="user">
              <Region />
            </ProtectedRoute>
          }
        />
        <Route
          path="/institution/duel/:contestId"
          element={
            <ProtectedRoute role="user">
              <InstitutionContestDuel />
            </ProtectedRoute>
          }
        />

        {/* INSTITUTE AUTH ROUTES */}
        <Route path="/institute-register" element={<InstituteRegister />} />
        <Route path="/institute-login" element={<InstituteLogin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
