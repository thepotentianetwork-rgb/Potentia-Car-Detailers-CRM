// Numbers for the owner dashboard and Analytics screen, computed only from
// the bookings the dashboard already loads (fetchTenantBookings, under RLS).
// Nothing here invents data: an empty input gives zeros / empty lists and the
// screens show an empty state instead.
//
// Dates: bookings.booking_date is the shop's calendar date (YYYY-MM-DD);
// created_at / updated_at are timestamps, converted to the shop's timezone.
// Weeks start on Monday.
import { iso } from "./time.js";
import { bookingLineItems } from "./bookingServices.js";

// The app's real booking stages, in pipeline order.
export const PIPELINE_STAGES = [
  { status: "pending", label: "New request" },
  { status: "approved", label: "Scheduled" },
  { status: "completed", label: "Completed" },
  { status: "declined", label: "Declined" },
  { status: "cancelled", label: "Cancelled" },
];

export const SOURCE_LABELS = { guest: "Online (guest)", account: "Online (customer account)", staff: "Added by staff" };

const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

// Monday of the week containing `key`.
export function weekStart(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  return addDays(key, -((dow + 6) % 7));
}

export function thisWeek(now, timeZone) {
  const today = iso(now, timeZone);
  const start = weekStart(today);
  return { today, start, end: addDays(start, 6) };
}

const inRange = (key, start, end) => !!key && key >= start && key <= end;
const createdKey = (b, timeZone) => (b.created_at ? iso(new Date(b.created_at), timeZone) : null);
const sumPrice = (list) => list.reduce((s, b) => s + (b.price_cents || 0), 0);

export function dashboardStats(bookings, now = new Date(), timeZone) {
  const { today, start, end } = thisWeek(now, timeZone);
  const completedWeek = bookings.filter((b) => b.status === "completed" && inRange(b.booking_date, start, end));
  return {
    newLeadsWeek: bookings.filter((b) => inRange(createdKey(b, timeZone), start, end)).length,
    appointmentsToday: bookings.filter((b) => b.booking_date === today && ["pending", "approved", "completed"].includes(b.status)).length,
    revenueWeekCents: sumPrice(completedWeek),
    completedWeek: completedWeek.length,
  };
}

export function todaysSchedule(bookings, now = new Date(), timeZone) {
  const today = iso(now, timeZone);
  return bookings
    .filter((b) => b.booking_date === today && b.status !== "declined" && b.status !== "cancelled")
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

export function pipelineCounts(bookings) {
  return PIPELINE_STAGES.map((s) => ({ ...s, count: bookings.filter((b) => b.status === s.status).length }));
}

// Newest first. Only events the data really records: a booking was created
// (created_at), or a booking was marked completed / paid (updated_at is the
// time of its latest change, so it's labelled "updated").
export function recentActivity(bookings, limit = 8) {
  const events = [];
  for (const b of bookings) {
    const who = b.profiles?.full_name || "Customer";
    if (b.created_at) {
      const kind = b.profiles?.source === "staff" ? "Booking added by staff" : "New booking request";
      events.push({ key: `${b.id}-new`, type: "new", title: kind, detail: `${who} · ${bookingTitleSafe(b)}`, at: b.created_at });
    }
    if (b.status === "completed" && b.updated_at) {
      events.push({
        key: `${b.id}-done`, type: b.paid ? "paid" : "completed",
        title: b.paid ? "Job completed · paid" : "Job completed",
        detail: `${who} · ${moneyCents(b.price_cents)}`, at: b.updated_at,
      });
    }
  }
  return events.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

const moneyCents = (c) => `$${Math.round((c || 0) / 100)}`;
const bookingTitleSafe = (b) => bookingLineItems(b).map((i) => i.name).join(" + ");

export function analytics(bookings, now = new Date(), timeZone, weeks = 8) {
  const today = iso(now, timeZone);
  const by = (s) => bookings.filter((b) => b.status === s);
  const completed = by("completed");
  const cancelled = by("cancelled");
  const declined = by("declined");
  // Follow-through: of the jobs the shop accepted whose day has come
  // (completed, cancelled, or still "approved" with a past date = not marked
  // done), how many were completed. Declined requests were never booked.
  const dueApproved = bookings.filter((b) => b.status === "approved" && b.booking_date < today);
  const due = completed.length + cancelled.length + dueApproved.length;

  // Most popular services: every line item on bookings that weren't declined
  // or cancelled. booking_services rows for new bookings; service_id +
  // booking_addons for bookings made before multi-service (bookingLineItems).
  const svc = new Map();
  for (const b of bookings) {
    if (b.status === "declined" || b.status === "cancelled") continue;
    for (const item of bookingLineItems(b)) {
      const row = svc.get(item.name) || { name: item.name, count: 0, revenueCents: 0 };
      row.count += 1;
      if (b.status === "completed") row.revenueCents += item.price_cents || 0;
      svc.set(item.name, row);
    }
  }
  const services = [...svc.values()].sort((a, b) => b.count - a.count || b.revenueCents - a.revenueCents);

  // Revenue by week (completed jobs, by job date), oldest first.
  const currentStart = weekStart(today);
  const trend = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(currentStart, -7 * i);
    const end = addDays(start, 6);
    const list = completed.filter((b) => inRange(b.booking_date, start, end));
    trend.push({ start, revenueCents: sumPrice(list), jobs: list.length });
  }

  // Repeat vs new: customers with 2+ completed jobs vs exactly 1.
  const perCustomer = new Map();
  for (const b of completed) {
    const c = perCustomer.get(b.profile_id) || { jobs: 0, cents: 0 };
    c.jobs += 1;
    c.cents += b.price_cents || 0;
    perCustomer.set(b.profile_id, c);
  }
  const custs = [...perCustomer.values()];
  const repeat = custs.filter((c) => c.jobs >= 2);
  const once = custs.filter((c) => c.jobs === 1);

  // Where bookings come from: the customer profile's source.
  const sources = {};
  for (const b of bookings) {
    const s = b.profiles?.source;
    if (!s) continue;
    sources[s] = (sources[s] || 0) + 1;
  }

  return {
    total: bookings.length,
    booked: bookings.filter((b) => b.status === "approved" || b.status === "completed" || b.status === "cancelled").length,
    pending: by("pending").length,
    upcoming: bookings.filter((b) => b.status === "approved" && b.booking_date >= today).length,
    completed: completed.length,
    cancelled: cancelled.length,
    declined: declined.length,
    notMarked: dueApproved.length,
    followThroughRate: due ? completed.length / due : null,
    avgPriceCents: completed.length ? Math.round(sumPrice(completed) / completed.length) : null,
    revenueCents: sumPrice(completed),
    services,
    trend,
    repeatCustomers: repeat.length,
    newCustomers: once.length,
    repeatRevenueCents: repeat.reduce((s, c) => s + c.cents, 0),
    newRevenueCents: once.reduce((s, c) => s + c.cents, 0),
    sources: Object.entries(sources).map(([key, count]) => ({ key, label: SOURCE_LABELS[key] || key, count })).sort((a, b) => b.count - a.count),
  };
}

// Per-customer rows for the customers table.
export function customerRows(bookings, today) {
  const map = new Map();
  for (const b of bookings) {
    const id = b.profile_id;
    if (!map.has(id)) {
      map.set(id, { profileId: id, name: b.profiles?.full_name || "Customer", phone: b.profiles?.phone, email: b.profiles?.email,
        source: b.profiles?.source, bookings: [], visits: 0, spendCents: 0 });
    }
    const c = map.get(id);
    c.bookings.push(b);
    if (b.status === "completed") { c.visits += 1; c.spendCents += b.price_cents || 0; }
  }
  for (const c of map.values()) {
    c.bookings.sort((a, b) => `${a.booking_date} ${a.start_time}`.localeCompare(`${b.booking_date} ${b.start_time}`));
    const last = c.bookings[c.bookings.length - 1];
    c.latest = last;
    c.vehicle = [...c.bookings].reverse().find((b) => b.vehicles?.label)?.vehicles?.label || "";
    c.upcoming = c.bookings.find((b) => (b.status === "approved" || b.status === "pending") && b.booking_date >= today) || null;
    c.history = c.bookings.filter((b) => b.status === "completed").reverse();
    c.lastActivity = c.bookings.reduce((m, b) => (b.updated_at && b.updated_at > m ? b.updated_at : m), "");
  }
  return [...map.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity) || b.spendCents - a.spendCents);
}
