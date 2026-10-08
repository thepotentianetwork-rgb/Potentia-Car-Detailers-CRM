// CONFIG hours use "9:00 AM" style; the database uses "14:00:00" style. Both get
// normalized to minutes-since-midnight so they can be compared directly.
export function parse12h(t) {
  const [time, mer] = t.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export function pgTimeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToDisplay(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${mer}`;
}

export function minutesToPgTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function bookingBusyInterval(b, bufferMin) {
  const start = pgTimeToMinutes(b.start_time);
  const end = start + b.duration_min;
  if (b.type === "mobile") {
    const half = bufferMin / 2;
    return [start - half, end + half];
  }
  return [start, end];
}

// Customers can't request a slot that starts sooner than this. Must match
// c_min_lead_min in request_booking() (guest-booking-migration.sql).
export const MIN_LEAD_MIN = 30;

// minStartMin hides slots that start before that minute of the day (see
// earliestStartFor); 0 means "show the whole day".
export function getAvailableStarts(dayBookings, durationMin, type, hours, granularity, bufferMin, minStartMin = 0) {
  const dayStart = parse12h(hours.start);
  const dayEnd = parse12h(hours.end);
  const busy = dayBookings.map((b) => bookingBusyInterval(b, bufferMin)).sort((a, b) => a[0] - b[0]);
  const half = bufferMin / 2;
  const options = [];
  for (let t = dayStart; t + durationMin <= dayEnd; t += granularity) {
    const candidateStart = type === "mobile" ? t - half : t;
    const candidateEnd = type === "mobile" ? t + durationMin + half : t + durationMin;
    const overlaps = busy.some(([bStart, bEnd]) => candidateStart < bEnd && candidateEnd > bStart);
    if (!overlaps && t >= minStartMin) options.push(t);
  }
  return options;
}

// Calendar parts of `d` as seen in `timeZone` (undefined = the browser's zone).
function partsInTz(d, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

// YYYY-MM-DD of `d` in `timeZone` (undefined = the browser's zone). This used
// to be toISOString(), which is UTC: in Denver it rolled over to "tomorrow"
// after 6 PM MDT / 5 PM MST, so evening customers saw the wrong day's slots.
export const iso = (d, timeZone) => {
  const p = partsInTz(d, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
};

// The next n calendar days starting from "today" in the business's timezone,
// as local-noon Dates so iso(day) and dayLabel(day) (browser zone) both read
// back the business's date even when the visitor is in another timezone.
export function getNextDays(n, timeZone, now = new Date()) {
  const [y, m, d] = iso(now, timeZone).split("-").map(Number);
  const days = [];
  for (let i = 0; i < n; i++) days.push(new Date(y, m - 1, d + i, 12));
  return days;
}

// Earliest bookable start (minutes since midnight) on dateKey: if dateKey is
// today in the business's timezone, now + leadMin; otherwise 0 (whole day).
export function earliestStartFor(dateKey, now = new Date(), timeZone, leadMin = MIN_LEAD_MIN) {
  if (dateKey !== iso(now, timeZone)) return 0;
  const p = partsInTz(now, timeZone);
  return Number(p.hour) * 60 + Number(p.minute) + leadMin;
}

export const dayLabel = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
