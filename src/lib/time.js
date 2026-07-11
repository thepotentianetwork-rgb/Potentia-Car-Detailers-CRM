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

export function getAvailableStarts(dayBookings, durationMin, type, hours, granularity, bufferMin) {
  const dayStart = parse12h(hours.start);
  const dayEnd = parse12h(hours.end);
  const busy = dayBookings.map((b) => bookingBusyInterval(b, bufferMin)).sort((a, b) => a[0] - b[0]);
  const half = bufferMin / 2;
  const options = [];
  for (let t = dayStart; t + durationMin <= dayEnd; t += granularity) {
    const candidateStart = type === "mobile" ? t - half : t;
    const candidateEnd = type === "mobile" ? t + durationMin + half : t + durationMin;
    const overlaps = busy.some(([bStart, bEnd]) => candidateStart < bEnd && candidateEnd > bStart);
    if (!overlaps) options.push(t);
  }
  return options;
}

export function getNextDays(n) {
  const days = [];
  const start = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export const iso = (d) => d.toISOString().split("T")[0];

export const dayLabel = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
