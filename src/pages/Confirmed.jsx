import { Check } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { useBranding } from "../tenants/branding.js";
import { useLang } from "../i18n/index.jsx";
import { serviceName } from "../i18n/services.js";
import { formatDay, formatTime, atTimeEs } from "../i18n/format.js";

export function Confirmed({ booking, onDone }) {
  const { config } = useTenant();
  const phone = useBranding().contact?.phone;
  const { lang, t } = useLang();
  // Re-format from the raw values when present, so switching language on
  // this screen updates it too.
  const service = booking.services ? booking.services.map((s) => serviceName(s, lang)).join(" + ") : booking.service;
  const day = booking.day ? formatDay(booking.day, lang) : booking.dateLabel;
  // Spanish weekdays are lower case mid-sentence ("el jue, 8 de oct").
  const date = lang === "es" && day ? day.charAt(0).toLowerCase() + day.slice(1) : day;
  const time = booking.startMinutes != null ? formatTime(booking.startMinutes, lang) : booking.time;
  const what = t("done.what", {
    service,
    type: t(booking.type === "mobile" ? "done.typeMobile" : "done.typeDropoff"),
    date,
    time,
    atTime: atTimeEs(time),
  }).replace(/\.\.$/, "."); // "10:00 a. m." already ends the sentence
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-[#173D22] flex items-center justify-center mb-4"><Check size={22} className="text-[#5FCB7C]" /></div>
      <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-lg font-bold mb-1">
        {booking.guest && booking.name ? t("done.thanks", { name: booking.name.split(" ")[0] }) : t("done.sent")}
      </h1>
      {booking.guest ? (
        // Guests have no account, and the app doesn't send texts or emails,
        // so promise only what happens: the shop gets in touch.
        <p className="text-sm text-[var(--brand-muted)] mb-6 max-w-xs">
          {t("done.guest", { what, business: config.businessName, atPhone: booking.phone ? t("done.atPhone", { phone: booking.phone }) : "" })}
        </p>
      ) : (
        <p className="text-sm text-[var(--brand-muted)] mb-6 max-w-xs">
          {t("done.account", { what })}
        </p>
      )}
      {phone && <p className="text-[12px] text-[var(--brand-muted)] mb-6 -mt-3 max-w-xs">{t("done.questions", { phone })}</p>}
      <button onClick={onDone} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm px-6 py-2.5 rounded-lg">{t("done.done")}</button>
    </div>
  );
}
