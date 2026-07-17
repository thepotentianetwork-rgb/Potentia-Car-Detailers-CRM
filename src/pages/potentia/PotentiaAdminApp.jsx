import { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { AuthScreen } from "../AuthScreen.jsx";
import { PotentiaAdminDashboard } from "./PotentiaAdminDashboard.jsx";

export function PotentiaAdminApp() {
  const { session, profile, checkingSession, handleAuthed, signOut } = useAuth();
  const [authMode, setAuthMode] = useState("login");

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex items-center justify-center">
        <LoadingBox center />
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div style={{ fontFamily: "Inter, sans-serif" }} className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex flex-col">
        <div className="text-center pt-8 pb-2 text-[13px] text-[#8B8F96]">Potentia · Platform Sign In</div>
        <AuthScreen mode={authMode} setMode={setAuthMode} onAuthed={handleAuthed} onBack={() => {}} setGlobalError={() => {}} allowSignup={false} />
      </div>
    );
  }

  if (profile.role !== "potentia_admin") {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-[#8B8F96] mb-4 max-w-xs">This account doesn't have platform admin access.</p>
        <button onClick={signOut} className="text-[13px] text-[#C9CDD3] underline">Sign out</button>
      </div>
    );
  }

  return <PotentiaAdminDashboard onSignOut={signOut} />;
}
