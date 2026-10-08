import { useState, useEffect } from "react";
import { Wrench, Phone, Mail, MapPin, CalendarDays, Wallet } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { fetchServices } from "../api/services.js";
import { useBranding, headingStyle, priceLabel, durationLabel } from "../tenants/branding.js";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBox } from "../components/ErrorBox.jsx";

// "#0A0A0B" -> "10,10,11", for the hero fade into the page background.
function rgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function Homepage({ onBook }) {
  const { tenant, config } = useTenant();
  const branding = useBranding();
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchServices(tenant.id).then(setServices).catch((e) => setError(e.message));
  }, [tenant.id]);

  const bg = branding.colors.bg;
  const contact = branding.contact;

  return (
    <main className="flex-1">
      <section className="relative overflow-hidden min-h-[480px] flex items-center justify-center text-center px-6">
        <video
          key={branding.hero.video}
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          autoPlay
          muted
          loop
          playsInline
          poster={branding.hero.poster || undefined}
        >
          <source src={branding.hero.video} type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 70% 50% at 50% 50%, transparent 0%, rgba(${rgb(bg)},0.6) 60%, rgba(${rgb(bg)},0.95) 85%, ${bg} 100%), linear-gradient(to bottom, ${bg} 0%, transparent 25%, transparent 75%, ${bg} 100%)`,
          }}
        />
        <div className="relative z-10 max-w-md mx-auto py-16">
          <img
            src={branding.logo.src}
            alt={branding.logo.alt}
            className={branding.logo.wide ? "w-64 max-w-full h-auto mx-auto mb-4 object-contain" : "w-12 h-12 mx-auto mb-3 object-contain"}
            style={{ filter: "drop-shadow(0 0 24px rgba(160,168,188,0.25))" }}
          />
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--brand-subtle)] mb-4">Powered by Potentia</p>
          <h1 style={headingStyle(branding)} className="text-[28px] font-extrabold mb-2 leading-tight tracking-tight">
            {config.businessName}
          </h1>
          {config.tagline && <p className="text-[13px] text-[var(--brand-muted)] mb-8">{config.tagline}</p>}
          {!config.tagline && <div className="mb-8" />}
          <button onClick={onBook} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm px-6 py-3 rounded-lg transition-colors">
            Book a Service
          </button>
        </div>
      </section>
      <section className="px-5 pb-12 max-w-md mx-auto">
        <h2 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-[12px] font-bold uppercase tracking-wide text-[var(--brand-muted)] mb-3">
          Services
        </h2>
        {error && <ErrorBox message={error} />}
        {!services && !error && <LoadingBox />}
        <div className="space-y-2.5">
          {services?.map((s) => {
            const includes = branding.serviceDetails[s.name]?.includes;
            return (
              <div key={s.id} className="bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-lg p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Wrench size={14} className="text-[var(--brand-subtle)] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-[11px] text-[var(--brand-subtle)]">{durationLabel(s, branding)}</div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-[var(--brand-soft)] shrink-0">{priceLabel(s, branding)}</span>
                </div>
                {includes?.length > 0 && (
                  <ul className="mt-2 ml-6 text-[12px] text-[var(--brand-muted)] space-y-0.5">
                    {includes.map((line) => <li key={line}>{includes.length > 1 ? `· ${line}` : line}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        {branding.priceNote && <p className="text-[11px] text-[var(--brand-subtle)] mt-3">{branding.priceNote}</p>}

        {contact && (
          <>
            <h2 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-[12px] font-bold uppercase tracking-wide text-[var(--brand-muted)] mt-8 mb-3">
              Contact &amp; Hours
            </h2>
            <div className="bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-lg p-3.5 space-y-2.5 text-[13px]">
              {contact.phone && (
                <div className="flex items-start gap-2.5"><Phone size={14} className="text-[var(--brand-subtle)] mt-0.5 shrink-0" /> <span>Call or text {contact.phone}</span></div>
              )}
              {contact.email && (
                <div className="flex items-start gap-2.5"><Mail size={14} className="text-[var(--brand-subtle)] mt-0.5 shrink-0" /> <span className="break-all">{contact.email}</span></div>
              )}
              {contact.address && (
                <div className="flex items-start gap-2.5"><MapPin size={14} className="text-[var(--brand-subtle)] mt-0.5 shrink-0" /> <span>Drop-off at {contact.address}</span></div>
              )}
              {contact.hours && (
                <div className="flex items-start gap-2.5"><CalendarDays size={14} className="text-[var(--brand-subtle)] mt-0.5 shrink-0" /> <span>Open {contact.hours}</span></div>
              )}
              {contact.payment && (
                <div className="flex items-start gap-2.5"><Wallet size={14} className="text-[var(--brand-subtle)] mt-0.5 shrink-0" /> <span>{contact.payment}</span></div>
              )}
              {(contact.serviceArea || contact.cities?.length > 0) && (
                <p className="text-[12px] text-[var(--brand-muted)] pt-1">
                  Mobile service: {contact.serviceArea}
                  {contact.cities?.length > 0 && ` · ${contact.cities.join(" · ")}`}
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
