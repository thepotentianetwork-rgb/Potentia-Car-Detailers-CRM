import { dollars } from "../lib/addons.js";
import { useLang } from "../i18n/index.jsx";
import { serviceName } from "../i18n/services.js";
import { formatDuration } from "../i18n/format.js";

// Pick any number of services (checkboxes). Order of picking is kept, so the
// first one ticked becomes the booking's main service.
// variant "public" uses the business's brand colors, "admin" the dashboard's.
export function ServicePicker({ services, selectedIds, onChange, priceText, variant = "public", className = "" }) {
  const { lang, t } = useLang();
  if (!services?.length) return null;
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const row = variant === "admin"
    ? "flex items-center gap-2 text-[12px] text-[#C9CDD3] cursor-pointer"
    : "flex items-center gap-2.5 text-sm bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-lg px-3 py-2 cursor-pointer";
  return (
    <fieldset className={className}>
      <legend className={variant === "admin" ? "text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block" : "text-[11px] uppercase tracking-wide text-[var(--brand-muted)] mb-1.5 block"}>
        {t("book.servicesLegend")}
      </legend>
      <div className={variant === "admin" ? "space-y-1" : "space-y-1.5"}>
        {services.map((s) => (
          <label key={s.id} className={row}>
            <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggle(s.id)} />
            <span>
              {serviceName(s, lang)} · {priceText ? priceText(s) : dollars(s.price_cents)} · {formatDuration(s.duration_min, lang)}
              {s.active === false ? " (inactive)" : ""}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
