import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { Header } from "../components/Header.jsx";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { Homepage } from "./Homepage.jsx";
import { AuthScreen } from "./AuthScreen.jsx";
import { BookingFlow } from "./BookingFlow.jsx";
import { Confirmed } from "./Confirmed.jsx";

export function CustomerPortal() {
  const { tenantSlug } = useParams();
  const { tenant } = useTenant();
  const { session, profile, checkingSession, profileError, handleAuthed, signOut } = useAuth();
  const [screen, setScreen] = useState("home");
  const [authMode, setAuthMode] = useState("login");
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex items-center justify-center">
        <LoadingBox center />
      </div>
    );
  }

  // Staff/admins land on the portal by mistake sometimes - send them to their dashboard.
  if (session && profile && profile.role !== "customer") {
    return <Navigate to={profile.role === "potentia_admin" ? "/crm/admin" : `/crm/${tenantSlug}`} replace />;
  }

  const wrongTenant = session && profile && profile.role === "customer" && profile.tenant_id !== tenant.id;

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }} className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex flex-col">
      {screen !== "admin" && (
        <Header
          loggedIn={!!session}
          onLogin={() => { setAuthMode("login"); setScreen("auth"); }}
          onDashboard={() => setScreen("customerBooking")}
          onSignOut={signOut}
        />
      )}

      {profileError && (
        <div className="mx-5 mt-3 flex items-start gap-2 bg-[#3D1515] border border-[#5C2323] rounded-lg px-3.5 py-2.5 text-[12px] text-[#E08A8A]">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {profileError}
        </div>
      )}

      {wrongTenant && (
        <div className="mx-5 mt-3 flex items-start gap-2 bg-[#3D1515] border border-[#5C2323] rounded-lg px-3.5 py-2.5 text-[12px] text-[#E08A8A]">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          You're signed in to a different business's account. Sign out to book with {tenant.name}.
        </div>
      )}

      <ErrorBoundary>
        {screen === "home" && <Homepage onBook={() => setScreen(session ? "customerBooking" : "auth")} />}

        {screen === "auth" && (
          <AuthScreen
            mode={authMode}
            setMode={setAuthMode}
            onAuthed={async (s) => { await handleAuthed(s); setScreen("customerBooking"); }}
            onBack={() => setScreen("home")}
            setGlobalError={() => {}}
            tenantSlug={tenantSlug}
          />
        )}

        {screen === "customerBooking" && session && profile && !wrongTenant && (
          <BookingFlow profile={profile} onConfirm={(b) => { setConfirmedBooking(b); setScreen("confirmed"); }} />
        )}

        {screen === "confirmed" && confirmedBooking && (
          <Confirmed booking={confirmedBooking} onDone={() => setScreen("home")} />
        )}

        {session && !profile && !profileError && (
          <div className="flex-1 flex items-center justify-center">
            <LoadingBox center />
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}
