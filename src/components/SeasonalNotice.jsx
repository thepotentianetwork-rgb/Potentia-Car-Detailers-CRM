import { useEffect, useState } from "react";
import { useBranding } from "../tenants/branding.js";
import { useLang } from "../i18n/index.jsx";

const DEFAULT_DAYS = 3;

function isDismissed(key) {
  if (!key) return true;
  try {
    const until = parseInt(localStorage.getItem(key) || "", 10);
    return !!until && Date.now() < until;
  } catch {
    return false;
  }
}

function remember(key, days) {
  try {
    localStorage.setItem(key, String(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch { /* private mode, etc. */ }
}

// Tenant-file pop-up (branding.seasonalNotice). Missing or dismissed = nothing.
// Does not change the drop-off / mobile booking controls.
export function SeasonalNotice() {
  const branding = useBranding();
  const { lang } = useLang();
  const notice = branding.seasonalNotice;
  const copy = lang === "es" && branding.es?.seasonalNotice
    ? { ...notice, ...branding.es.seasonalNotice }
    : notice;
  const [open, setOpen] = useState(() => notice && !isDismissed(notice.storageKey));

  useEffect(() => {
    setOpen(!!notice && !isDismissed(notice.storageKey));
  }, [notice]);

  if (!notice || !open) return null;

  const close = () => {
    remember(notice.storageKey, notice.days ?? DEFAULT_DAYS);
    setOpen(false);
  };

  const address = copy.address || branding.contact?.address;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="seasonal-notice-title"
      aria-describedby="seasonal-notice-body"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/75"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="relative w-full max-w-md bg-[var(--brand-surface)] border border-[var(--brand-border)] px-7 pt-8 pb-6 shadow-2xl">
        <button
          type="button"
          aria-label={copy.closeLabel || "Close notice"}
          onClick={close}
          className="absolute top-2 right-3 w-10 h-10 text-[var(--brand-muted)] hover:text-[var(--brand-soft)] text-2xl leading-none"
        >
          ×
        </button>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--brand-primary)] mb-3">
          {copy.kicker}
        </p>
        <h2 id="seasonal-notice-title" style={{ fontFamily: "var(--brand-font-heading)" }} className="text-[26px] font-black uppercase tracking-wide text-[var(--brand-text)] leading-tight mb-3">
          {copy.title}
        </h2>
        <p id="seasonal-notice-body" className="text-[15px] leading-relaxed text-[var(--brand-text)] mb-3">
          {copy.body}
        </p>
        {address && (
          <p className="text-[11px] tracking-wide text-[var(--brand-muted)] mb-6">
            {copy.addressPrefix ? `${copy.addressPrefix} ${address}` : address}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={close}
            className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm px-6 py-3 rounded-lg transition-colors"
          >
            {copy.cta || "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
