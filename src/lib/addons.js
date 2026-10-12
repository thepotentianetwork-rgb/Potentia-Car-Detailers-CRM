// Money/time formatting, plus read-only helpers for bookings made while
// add-ons existed (their booking_addons rows are still shown on those
// bookings). New bookings pick several services instead: see bookingServices.js.

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

// Add-on snapshot rows on an older booking (booking_addons embed); [] when absent.
export const bookingAddons = (b) => b?.booking_addons || [];

// Homepage "includes" lines: the owner-editable services.description (one
// line per row) wins; the tenant file's hard-coded copy is the fallback, so
// a blank description never hides what used to be shown.
export function serviceIncludes(service, branding) {
  const lines = (service?.description || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length) return lines;
  return branding?.serviceDetails?.[service?.name]?.includes || [];
}
