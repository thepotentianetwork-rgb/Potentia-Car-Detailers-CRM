import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabaseClient.js";
import { fetchProfile } from "./api/profiles.js";
import { signOut as apiSignOut } from "./api/auth.js";
import { Header } from "./components/Header.jsx";
import { LoadingBox } from "./components/LoadingBox.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { Homepage } from "./pages/Homepage.jsx";
import { AuthScreen } from "./pages/AuthScreen.jsx";
import { BookingFlow } from "./pages/BookingFlow.jsx";
import { Confirmed } from "./pages/Confirmed.jsx";
import { AdminDashboard } from "./pages/admin/AdminDashboard.jsx";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [authMode, setAuthMode] = useState("login");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [globalError, setGlobalError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  const loadProfileForSession = async (session) => {
    try {
      const p = await fetchProfile(session.user.id);
      setProfile(p);
      setScreen((prev) => (prev === "home" || prev === "auth" ? (p?.role === "admin" ? "admin" : "customerBooking") : prev));
    } catch (e) {
      setGlobalError("Signed in, but couldn't load your profile: " + e.message);
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
      if (!session) {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleAuthed = async (session) => {
    setSession(session);
    await loadProfileForSession(session);
  };

  const signOut = async () => {
    await apiSignOut();
    setSession(null);
    setProfile(null);
    setScreen("home");
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex items-center justify-center">
        <LoadingBox center />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }} className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex flex-col">
      {screen !== "admin" && (
        <Header
          loggedIn={!!session}
          onLogin={() => { setAuthMode("login"); setScreen("auth"); }}
          onDashboard={() => setScreen(profile?.role === "admin" ? "admin" : "customerBooking")}
          onSignOut={signOut}
        />
      )}

      {globalError && (
        <div className="mx-5 mt-3 flex items-start gap-2 bg-[#3D1515] border border-[#5C2323] rounded-lg px-3.5 py-2.5 text-[12px] text-[#E08A8A]">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {globalError}
        </div>
      )}

      <ErrorBoundary>
        {screen === "home" && <Homepage onBook={() => setScreen(session ? "customerBooking" : "auth")} />}

        {screen === "auth" && (
          <AuthScreen
            mode={authMode}
            setMode={setAuthMode}
            onAuthed={handleAuthed}
            onBack={() => setScreen("home")}
            setGlobalError={setGlobalError}
          />
        )}

        {screen === "customerBooking" && session && profile && (
          <BookingFlow profile={profile} onConfirm={(b) => { setConfirmedBooking(b); setScreen("confirmed"); }} />
        )}

        {screen === "confirmed" && confirmedBooking && (
          <Confirmed booking={confirmedBooking} onDone={() => setScreen("home")} />
        )}

        {screen === "admin" && session && profile?.role === "admin" && (
          <AdminDashboard session={session} onSignOut={signOut} />
        )}

        {session && !profile && screen !== "auth" && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-sm text-[#8B8F96] mb-2 max-w-xs">
              You're signed in, but your account profile couldn't be loaded.
            </p>
            <p className="text-[11px] text-[#5C5F66] mb-4 max-w-xs break-all">
              Signed in as: {session.user?.email}<br />User ID: {session.user?.id}
            </p>
            <button onClick={signOut} className="text-[13px] text-[#C9CDD3] underline">Sign out and try again</button>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}
