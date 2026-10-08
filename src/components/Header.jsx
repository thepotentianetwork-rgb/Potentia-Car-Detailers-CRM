import { LogOut, User } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { useBranding } from "../tenants/branding.js";

export function Header({ loggedIn, onLogin, onDashboard, onSignOut }) {
  const { config } = useTenant();
  const branding = useBranding();
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
      {loggedIn ? (
        <div className="flex items-center gap-3">
          <button onClick={onDashboard} className="text-[13px] font-medium text-[var(--brand-soft)] hover:text-[var(--brand-primary-hover)]">
            My Account
          </button>
          <button onClick={onSignOut} className="flex items-center gap-1.5 text-[12px] text-[var(--brand-muted)] hover:text-[var(--brand-text)]">
            <LogOut size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={onLogin}
          className="flex items-center gap-1.5 text-[13px] font-medium border border-[var(--brand-border-strong)] hover:border-[var(--brand-border-hover)] px-3.5 py-1.5 rounded-md transition-colors"
        >
          <User size={13} /> Log In
        </button>
      )}
    </header>
  );
}
