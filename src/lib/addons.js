// Add-ons: extras (e.g. Pet Hair Removal) a customer can stack on any service.
// The server (request_booking / set_booking_service_addons /
// create_manual_booking) is the source of truth for price and duration; these
// helpers only mirror its math so the UI can show totals and pick slots that
// fit the FULL job (service + every add-on).

export const dollars = (cents) => {
  const d = (cents || 0) / 100;
  return `$${Number.isInteger(d) ? d.toFixed(0) : d.toFixed(2)}`;
};

export const minutesText = (m) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
};

// "Pet Hair Removal +$35 (+30 min)"
export function addonLabel(a) {
  const extra = a.extra_duration_min > 0 ? ` (+${a.extra_duration_min} min)` : "";
  return `${a.name} +${dollars(a.price_cents)}${extra}`;
}

// Selected add-ons (deduped, unknown ids ignored) and the job's totals.
export function addonTotals(service, addons, selectedIds) {
  const ids = new Set(selectedIds || []);
  const selected = (addons || []).filter((a) => ids.has(a.id));
  const addonCents = selected.reduce((s, a) => s + a.price_cents, 0);
  const addonMin = selected.reduce((s, a) => s + (a.extra_duration_min || 0), 0);
  return {
    selected,
    addonCents,
    addonMin,
    priceCents: (service?.price_cents || 0) + addonCents,
    durationMin: (service?.duration_min || 0) + addonMin,
  };
}

// Snapshot rows on a booking (booking_addons embed); [] when absent.
export const bookingAddons = (b) => b?.booking_addons || [];

// Homepage "includes" lines: the owner-editable services.description (one
// line per row) wins; the tenant file's hard-coded copy is the fallback, so
// a blank description never hides what used to be shown.
export function serviceIncludes(service, branding) {
  const lines = (service?.description || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length) return lines;
  return branding?.serviceDetails?.[service?.name]?.includes || [];
}
