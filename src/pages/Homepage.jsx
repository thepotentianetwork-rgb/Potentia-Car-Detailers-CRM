import { useState, useEffect } from "react";
import { Wrench } from "lucide-react";
import { CONFIG } from "../config.js";
import { fetchServices } from "../api/services.js";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBox } from "../components/ErrorBox.jsx";

export function Homepage({ onBook }) {
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchServices().then(setServices).catch((e) => setError(e.message));
  }, []);

  return (
    <main className="flex-1">
      <section className="px-6 py-16 text-center max-w-md mx-auto">
        <h1 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-2xl font-extrabold mb-2 leading-tight">
          {CONFIG.tagline}
        </h1>
        <p className="text-[13px] text-[#8B8F96] mb-8">Mobile and drop-off detailing. Book online, track your service history, done.</p>
        <button onClick={onBook} className="bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm px-6 py-3 rounded-lg transition-colors">
          Book a Service
        </button>
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
