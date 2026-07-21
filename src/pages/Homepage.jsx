import { useState, useEffect } from "react";
import { Wrench } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { fetchServices } from "../api/services.js";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBox } from "../components/ErrorBox.jsx";

export function Homepage({ onBook }) {
  const { tenant, config } = useTenant();
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchServices(tenant.id).then(setServices).catch((e) => setError(e.message));
  }, [tenant.id]);

  return (
    <main className="flex-1">
      <section className="relative overflow-hidden min-h-[480px] flex items-center justify-center text-center px-6">
        <video
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="/potentia-hero-bg.mp4" type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 50%, transparent 0%, rgba(10,10,11,0.6) 60%, rgba(10,10,11,0.95) 85%, #0A0A0B 100%), linear-gradient(to bottom, #0A0A0B 0%, transparent 25%, transparent 75%, #0A0A0B 100%)",
          }}
        />
        <div className="relative z-10 max-w-md mx-auto py-16">
          <img
            src="/potentia-logo.png"
            alt="Potentia"
            className="w-12 h-12 mx-auto mb-3 object-contain"
            style={{ filter: "drop-shadow(0 0 24px rgba(160,168,188,0.25))" }}
          />
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#5C5F66] mb-4">Powered by Potentia</p>
          <h1 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[28px] font-extrabold mb-2 leading-tight tracking-tight">
            {config.businessName}
          </h1>
          {config.tagline && <p className="text-[13px] text-[#8B8F96] mb-8">{config.tagline}</p>}
          {!config.tagline && <div className="mb-8" />}
          <button onClick={onBook} className="bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm px-6 py-3 rounded-lg transition-colors">
            Book a Service
          </button>
        </div>
      </section>
      <section className="px-5 pb-12 max-w-md mx-auto">
        <h2 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[12px] font-bold uppercase tracking-wide text-[#8B8F96] mb-3">
          Services
        </h2>
        {error && <ErrorBox message={error} />}
        {!services && !error && <LoadingBox />}
        <div className="space-y-2.5">
          {services?.map((s) => (
            <div key={s.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Wrench size={14} className="text-[#5C5F66]" />
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] text-[#5C5F66]">
                    {s.duration_min >= 60 ? `${(s.duration_min / 60).toFixed(s.duration_min % 60 ? 1 : 0)} hr` : `${s.duration_min} min`}
                  </div>
                </div>
              </div>
              <span className="text-sm font-semibold text-[#C9CDD3]">${(s.price_cents / 100).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
