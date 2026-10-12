// Multi-service bookings: a customer or staff member picks any number of
// services; prices and minutes add up to one job. The server
// (request_booking / create_manual_booking / set_booking_services) is the
// source of truth; these helpers mirror its math so the UI can show totals
// and offer only slots that fit the WHOLE job.
import { bookingAddons } from "./addons.js";

// Chosen services in the order they were picked (deduped, unknown ids ignored).
export function serviceTotals(services, selectedIds) {
  const byId = new Map((services || []).map((s) => [s.id, s]));
  const selected = [...new Set(selectedIds || [])].map((id) => byId.get(id)).filter(Boolean);
  return {
    selected,
    priceCents: selected.reduce((sum, s) => sum + (s.price_cents || 0), 0),
    durationMin: selected.reduce((sum, s) => sum + (s.duration_min || 0), 0),
  };
}

// The line items of a booking as booked:
// - new bookings: their booking_services snapshot rows, in order;
// - older bookings (no booking_services rows): the one service plus any
//   add-ons from the add-on era, with the service's share of the total
//   derived from the stored price/duration so lines still add up.
export function bookingLineItems(b) {
  const rows = [...(b?.booking_services || [])].sort((x, y) => (x.position || 0) - (y.position || 0));
  if (rows.length) {
    return rows.map((r) => ({ key: r.id || r.service_id || r.name, name: r.name, price_cents: r.price_cents, duration_min: r.duration_min }));
  }
  const addons = bookingAddons(b);
  const addonCents = addons.reduce((s, a) => s + (a.price_cents || 0), 0);
  const addonMin = addons.reduce((s, a) => s + (a.extra_duration_min || 0), 0);
  return [
    { key: "service", name: b?.services?.name || "Service", price_cents: (b?.price_cents || 0) - addonCents, duration_min: (b?.duration_min || 0) - addonMin },
    ...addons.map((a) => ({ key: a.id || a.name, name: a.name, price_cents: a.price_cents, duration_min: a.extra_duration_min || 0, addon: true })),
  ];
}

// "Full Detail + Pet Hair Removal"
export const bookingTitle = (b) => bookingLineItems(b).map((i) => i.name).join(" + ");

// Service ids currently on a booking (for the editor's checkboxes).
export function bookingServiceIds(b) {
  const rows = [...(b?.booking_services || [])].sort((x, y) => (x.position || 0) - (y.position || 0));
  const ids = rows.map((r) => r.service_id).filter(Boolean);
  return ids.length ? ids : b?.service_id ? [b.service_id] : [];
}
