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
      <section className="relative overflow-hidden min-h-[280px] flex items-center justify-center text-center px-6">
        <video className="absolute inset-0 w-full h-full object-cover opacity-40" autoPlay muted loop playsInline>
          <source src="/potentia-hero-bg.mp4" type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 40%, transparent 0%, rgba(10,10,11,0.6) 60%, rgba(10,10,11,0.95) 85%, #0A0A0B 100%), linear-gradient(to bottom, #0A0A0B 0%, transparent 25%, transparent 75%, #0A0A0B 100%)",
          }}
        />
        <div className="relative z-10 py-10">
          <img
            src="/potentia-logo.png"
            alt="Potentia"
            className="w-14 h-14 mx-auto mb-4 object-contain"
            style={{ filter: "drop-shadow(0 0 24px rgba(160,168,188,0.25))" }}
          />
          <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-lg font-extrabold uppercase tracking-wide">
            Potentia
          </div>
          <div className="text-[12px] text-[#8B8F96] mt-1">Client Login</div>
        </div>
      </section>
      {error && (
        <div className="mx-5 mt-3">
          <ErrorBox message={error} />
        </div>
      )}
      <AuthScreen mode={authMode} setMode={setAuthMode} onAuthed={handleAuthed} onBack={() => {}} setGlobalError={() => {}} allowSignup={false} />
    </div>
  );
}
