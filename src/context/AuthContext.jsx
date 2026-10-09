import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { fetchProfile } from "../api/profiles.js";
import { signOut as apiSignOut } from "../api/auth.js";
import { getPendingAuthLink, clearPendingAuthLink } from "../lib/authRedirect.js";

const AuthContext = createContext(null);

// Where owners, staff and Potentia admins land after signing out: the Potentia
// client login page (the in-app /login route, ClientLogin.jsx), so they can sign
// straight back in. A same-origin path rather than a full URL so preview
// deployments stay on the preview instead of jumping to production.
export const SIGN_OUT_PATH = "/login";

// signOut is wired straight to buttons (onClick={signOut}), so its argument may
// be a click event rather than options. Events (React or DOM) are never read as
// options; only a plain object with a redirectTo key can change the destination.
export function resolveSignOutRedirect(opts) {
  if (opts == null || typeof opts !== "object") return SIGN_OUT_PATH;
  const isEvent = "nativeEvent" in opts || (typeof Event !== "undefined" && opts instanceof Event);
  if (isEvent || !("redirectTo" in opts)) return SIGN_OUT_PATH;
  return opts.redirectTo;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profileError, setProfileError] = useState("");
  // Invite / password-recovery link this page was opened with (see authRedirect.js).
  const [authLink, setAuthLink] = useState(getPendingAuthLink);

  const loadProfileForSession = async (session) => {
    try {
      const p = await fetchProfile(session.user.id);
      setProfile(p);
    } catch (e) {
      setProfileError("Signed in, but couldn't load your profile: " + e.message);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfileForSession(session);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setAuthLink({ type: "recovery", error: null });
      setSession(session);
      if (!session) setProfile(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleAuthed = async (session) => {
    setSession(session);
    setProfileError("");
    await loadProfileForSession(session);
  };

  // signOut() / onClick={signOut} -> go to the client login page (/login).
  // signOut({ redirectTo: null }) -> stay on the current page (customer portal,
  // "wrong account" screens) so the in-place sign-in form re-renders.
  const signOut = async (opts) => {
    const redirectTo = resolveSignOutRedirect(opts);
    try {
      await apiSignOut();
    } catch (e) {
      console.error("Sign-out error (clearing local session anyway):", e);
    }
    setSession(null);
    setProfile(null);
    if (redirectTo) window.location.replace(redirectTo);
  };

  const clearAuthLink = () => {
    clearPendingAuthLink();
    setAuthLink({ type: null, error: null });
  };

  return (
    <AuthContext.Provider value={{ session, profile, checkingSession, profileError, handleAuthed, signOut, authLink, clearAuthLink }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
