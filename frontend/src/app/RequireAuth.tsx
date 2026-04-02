import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export function RequireAuth() {
  const { accessToken } = useAuth();
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
