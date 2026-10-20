import { LogOut, User } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { useBranding } from "../tenants/branding.js";
import { useLang } from "../i18n/index.jsx";

// EN | ES switch, only for shops with the language toggle on.
function LanguageToggle() {
  const { lang, setLang, enabled, t } = useLang();
  if (!enabled) return null;
  const btn = (code) => (
    <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}
      className={`px-2 py-1 text-[11px] font-semibold tracking-wide rounded ${lang === code ? "bg-[var(--brand-primary)] text-[var(--brand-on-primary)]" : "text-[var(--brand-muted)] hover:text-[var(--brand-text)]"}`}>
      {code.toUpperCase()}
    </button>
  );
  return (
    <div role="group" aria-label={`${t("lang.label")} / ${lang === "es" ? "Language" : "Idioma"}`}
      className="flex items-center gap-0.5 border border-[var(--brand-border-strong)] rounded-md p-0.5">
      {btn("en")}{btn("es")}
    </div>
  );
}

export function Header({ loggedIn, onLogin, onDashboard, onSignOut, showLogin = true }) {
  const { config } = useTenant();
  const branding = useBranding();
  const { t } = useLang();
  return (
    <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--brand-divider)]">
      <div className="flex items-center gap-2.5">
        {branding.logo.wide ? (
          <img src={branding.logo.src} alt={branding.logo.alt} className="h-9 w-auto object-contain" />
        ) : (
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-[#3A3D42] to-[#17181B] border border-[#3A3D42] flex items-center justify-center p-1.5">
            <img src={branding.logo.src} alt={branding.logo.alt} className="w-full h-full object-contain" />
          </div>
        )}
        <div style={{ fontFamily: "var(--brand-font-heading)" }} className="text-[14px] font-bold tracking-wide uppercase">
          {config.businessName}
        </div>
      </div>
      <div className="flex items-center gap-3">
      <LanguageToggle />
      {loggedIn ? (
        <div className="flex items-center gap-3">
          <button onClick={onDashboard} className="text-[13px] font-medium text-[var(--brand-soft)] hover:text-[var(--brand-primary-hover)]">
            {t("header.myAccount")}
          </button>
          <button onClick={onSignOut} aria-label={t("header.signOut")} className="flex items-center gap-1.5 text-[12px] text-[var(--brand-muted)] hover:text-[var(--brand-text)]">
            <LogOut size={13} />
          </button>
        </div>
      ) : !showLogin ? null : (
        <button
          onClick={onLogin}
          className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium border border-[var(--brand-border-strong)] hover:border-[var(--brand-border-hover)] px-3.5 py-1.5 rounded-md transition-colors"
        >
          <User size={13} /> {t("header.login")}
        </button>
      )}
      </div>
    </header>
  );
}
