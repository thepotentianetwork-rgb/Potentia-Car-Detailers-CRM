import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SET_PASSWORD_PATH, setPasswordPath, businessFromPath } from "../lib/authRedirect.js";

// If the app was opened from an invite / password-reset link (or one that
// failed), send the visitor to /set-password before any other page can
// route them away, even when Supabase redirected to the Site URL instead.
export function AuthLinkGuard({ children }) {
  const { authLink } = useAuth();
  const location = useLocation();
  if ((authLink?.type || authLink?.error) && location.pathname !== SET_PASSWORD_PATH) {
    const business = new URLSearchParams(location.search).get("business") || businessFromPath(location.pathname);
    return <Navigate to={setPasswordPath(business)} replace />;
  }
  return children;
}
