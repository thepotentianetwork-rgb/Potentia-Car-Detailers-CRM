import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { Header } from "../components/Header.jsx";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { Homepage } from "./Homepage.jsx";
import { AuthScreen } from "./AuthScreen.jsx";
import { BookingFlow } from "./BookingFlow.jsx";
import { Confirmed } from "./Confirmed.jsx";
import { useBranding, brandingStyle, useTenantDocument } from "../tenants/branding.js";

export function CustomerPortal() {
  const { tenantSlug } = useParams();
  const { tenant } = useTenant();
  const { session, profile, checkingSession, profileError, handleAuthed, signOut } = useAuth();
  const [screen, setScreen] = useState("home");
  const [authMode, setAuthMode] = useState("login");
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const branding = useBranding();
  useTenantDocument(branding, tenant.name);

  if (checkingSession) {
    return (
      <div style={brandingStyle(branding)} className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] flex items-center justify-center">
        <LoadingBox center />
      </div>
    );
  }

  // Potentia admins and shop owners/staff can open the public booking page to
  // try it (no redirect to their dashboard). They book as a guest: the server
  // treats any signed-in non-customer as a guest, so nothing is filed under
  // their own account.
  const host = !!(session && profile && profile.role !== "customer");
  const hostHome = profile?.role === "potentia_admin" ? "/crm/admin" : `/crm/${tenantSlug}`;

  // Customers stay on their shop's portal after signing out (the Potentia client
  // login is for business owners, not the detailer's customers) and go back to
  // the shop homepage.
  const handleSignOut = async () => {
    await signOut({ redirectTo: null });
    setConfirmedBooking(null);
    setScreen("home");
  };

  const wrongTenant = session && profile && profile.role === "customer" && profile.tenant_id !== tenant.id;
  // Guest booking needs no session (hosts book as guests too). If a customer
  // signs in meanwhile, the signed-in booking flow takes over instead.
  // Guest-only shops (Juan's) never show login/sign-up: Book goes straight to
  // the guest form, and the auth screen is never offered.
  const guestOnly = branding.guestOnly;
  const bookingAsGuest = (screen === "guestBooking" || (guestOnly && screen === "auth")) && (!session || host);
  const bookingSignedIn = (screen === "customerBooking" || screen === "guestBooking") && session && profile && !wrongTenant && !host;

  return (
    <div style={brandingStyle(branding)} className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] flex flex-col">
      {screen !== "admin" && (
        <Header
          loggedIn={!!session && !host}
          showLogin={!guestOnly}
          onLogin={() => { setAuthMode("login"); setScreen("auth"); }}
          onDashboard={() => setScreen("customerBooking")}
          onSignOut={handleSignOut}
        />
      )}

      {profileError && (
        <div className="mx-5 mt-3 flex items-start gap-2 bg-[#3D1515] border border-[#5C2323] rounded-lg px-3.5 py-2.5 text-[12px] text-[#E08A8A]">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {profileError}
        </div>
      )}

      {host && (
        <div role="status" className="mx-5 mt-3 flex items-start gap-2 bg-[#1E2A3D] border border-[#2D3F5C] rounded-lg px-3.5 py-2.5 text-[12px] text-[#8FB3E8]">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>
            You're signed in as {profile.role === "potentia_admin" ? "a Potentia admin" : "staff"}. This is the customer booking page; a test
            booking here is saved as a guest request (pending) and shows up in Requests.{" "}
            <Link to={hostHome} className="underline">Back to {profile.role === "potentia_admin" ? "admin" : "dashboard"}</Link>
          </span>
        </div>
      )}

      {wrongTenant && (
        <div className="mx-5 mt-3 flex items-start gap-2 bg-[#3D1515] border border-[#5C2323] rounded-lg px-3.5 py-2.5 text-[12px] text-[#E08A8A]">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          You're signed in to a different business's account. Sign out to book with {tenant.name}.
        </div>
      )}

      <ErrorBoundary>
        {screen === "home" && (
          <Homepage
            onBook={() => {
              if (host) return setScreen("guestBooking");
              if (session) return setScreen("customerBooking");
              if (guestOnly) return setScreen("guestBooking");
              setAuthMode("choose");
              setScreen("auth");
            }}
          />
        )}

        {screen === "auth" && !guestOnly && (
          <AuthScreen
            mode={authMode}
            setMode={setAuthMode}
            onAuthed={async (s) => { await handleAuthed(s); setScreen("customerBooking"); }}
            onBack={() => setScreen("home")}
            onGuest={() => setScreen("guestBooking")}
            setGlobalError={() => {}}
            tenantSlug={tenantSlug}
          />
        )}

        {bookingSignedIn && (
          <BookingFlow
            customer={{ name: profile.full_name, phone: profile.phone, email: profile.email || session.user?.email }}
            onConfirm={(b) => { setConfirmedBooking(b); setScreen("confirmed"); }}
          />
        )}

        {bookingAsGuest && (
          <BookingFlow guest onConfirm={(b) => { setConfirmedBooking(b); setScreen("confirmed"); }} />
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
