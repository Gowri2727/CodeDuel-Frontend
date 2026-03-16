import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children, role }) {
  const location = useLocation();
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("role");

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role && userRole !== role) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
