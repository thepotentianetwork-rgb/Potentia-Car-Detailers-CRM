import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchTenantById } from "../api/tenants.js";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBox } from "../components/ErrorBox.jsx";
import { AuthScreen } from "./AuthScreen.jsx";

export function ClientLogin() {
  const navigate = useNavigate();
  const { session, profile, checkingSession, handleAuthed } = useAuth();
  const [authMode, setAuthMode] = useState("login");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session || !profile) return;

    const route = async () => {
      try {
        if (profile.role === "potentia_admin") {
          navigate("/crm/admin", { replace: true });
          return;
        }
        const tenant = await fetchTenantById(profile.tenant_id);
        if (profile.role === "business_owner" || profile.role === "staff") {
          navigate(`/crm/${tenant.slug}`, { replace: true });
        } else {
          navigate(`/crm/${tenant.slug}/portal`, { replace: true });
        }
      } catch (e) {
        setError("Signed in, but couldn't find your business. Contact Potentia support.");
      }
    };
    route();
  }, [session, profile, navigate]);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex items-center justify-center">
        <LoadingBox center />
      </div>
    );
  }

  if (session && profile && !error) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex items-center justify-center">
        <LoadingBox center />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }} className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex flex-col">
      <div className="text-center pt-10 pb-2">
        <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-lg font-extrabold uppercase tracking-wide">
          Potentia
        </div>
        <div className="text-[12px] text-[#8B8F96] mt-1">Client Login</div>
      </div>
      {error && (
        <div className="mx-5 mt-3">
          <ErrorBox message={error} />
        </div>
      )}
      <AuthScreen mode={authMode} setMode={setAuthMode} onAuthed={handleAuthed} onBack={() => {}} setGlobalError={() => {}} allowSignup={false} />
    </div>
  );
}
