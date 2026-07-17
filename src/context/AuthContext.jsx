import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { fetchProfile } from "../api/profiles.js";
import { signOut as apiSignOut } from "../api/auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profileError, setProfileError] = useState("");

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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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

  const signOut = async () => {
    await apiSignOut();
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, checkingSession, profileError, handleAuthed, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
