import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { rescheduleBooking } from "../../api/bookings.js";
import { getAvailableStarts, getNextDays, iso, dayLabel, minutesToDisplay, minutesToPgTime, earliestStartFor } from "../../lib/time.js";
import { minutesText } from "../../lib/addons.js";

// Bookings that still hold their time on the calendar.
export const isLive = (b) => b.status !== "declined" && b.status !== "cancelled";

// Open start times for moving `booking` to dateKey: its FULL duration
// (service + add-ons), business hours and slot grid, the mobile buffer, and
// every other live booking that day (the booking itself doesn't block).
export function rescheduleStarts(booking, allBookings, dateKey, config, now = new Date()) {
  const others = allBookings.filter((b) => b.booking_date === dateKey && b.id !== booking.id && isLive(b));
  return getAvailableStarts(
    others, booking.duration_min, booking.type, config.businessHours, config.bookingGranularityMin,
    config.mobileTravelBufferMin, earliestStartFor(dateKey, now, config.timezone, 0)
  );
}

// Owner/staff: move a pending or approved booking to another open slot. The
// server (reschedule_booking) re-checks everything and keeps the status.
export function RescheduleForm({ booking, allBookings, onCancel, onSaved }) {
  const { config } = useTenant();
  const days = useMemo(() => getNextDays(14, config.timezone), [config.timezone]);
  const startIndex = Math.max(0, days.findIndex((d) => iso(d) === booking.booking_date));
  const [dayIndex, setDayIndex] = useState(startIndex);
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dateKey = iso(days[dayIndex]);
  const starts = rescheduleStarts(booking, allBookings, dateKey, config);

  const save = async () => {
    if (picked == null) return;
    setSaving(true);
    setError("");
    try {
      await rescheduleBooking(booking.id, { bookingDate: dateKey, startTime: minutesToPgTime(picked) });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const go = (delta) => {
    setPicked(null);
    setDayIndex((i) => Math.min(days.length - 1, Math.max(0, i + delta)));
  };

  return (
    <div className="bg-[#0D0E10] border border-[#232529] rounded-lg p-2.5 space-y-2" data-testid="reschedule-form">
      <div className="text-[11px] text-[#8B8F96]">Reschedule · {minutesText(booking.duration_min)} job</div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous day" onClick={() => go(-1)} disabled={dayIndex === 0} className="p-1 border border-[#232529] rounded text-[#8B8F96] disabled:opacity-30"><ChevronLeft size={12} /></button>
        <div className="flex-1 text-center text-[12px] font-medium">{dayLabel(days[dayIndex])}</div>
        <button type="button" aria-label="Next day" onClick={() => go(1)} disabled={dayIndex === days.length - 1} className="p-1 border border-[#232529] rounded text-[#8B8F96] disabled:opacity-30"><ChevronRight size={12} /></button>
      </div>
      {starts.length === 0 ? (
        <div className="text-[11px] text-[#5C5F66] text-center py-2">No open time on this day fits this {minutesText(booking.duration_min)} job.</div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {starts.map((m) => (
            <button key={m} type="button" onClick={() => setPicked(m)}
              className={`flex items-center justify-center gap-1 text-[11px] py-1.5 rounded border ${picked === m ? "border-[#C9CDD3] text-white" : "border-[#232529] text-[#C9CDD3]"}`}>
              <Clock size={10} /> {minutesToDisplay(m)}
            </button>
          ))}
        </div>
      )}
      {error && <div className="text-[10px] text-[#E08A8A]">{error}</div>}
      <div className="flex gap-1.5">
        <button type="button" onClick={save} disabled={saving || picked == null}
          className="flex-1 text-[10px] font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white py-1.5 rounded disabled:opacity-60">
          {saving ? "Moving…" : picked == null ? "Pick a time" : `Move to ${minutesToDisplay(picked)}`}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 text-[10px] text-[#8B8F96] border border-[#232529] py-1.5 rounded">Cancel</button>
      </div>
    </div>
  );
}
