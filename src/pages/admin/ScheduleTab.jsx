import { Home, Building2 } from "lucide-react";
import { CONFIG } from "../../config.js";
import { getNextDays, iso, dayLabel, minutesToDisplay, pgTimeToMinutes, parse12h } from "../../lib/time.js";

export function ScheduleTab({ bookings, busyId, onAct }) {
  const days = getNextDays(6);
  const dayStart = parse12h(CONFIG.businessHours.start);
  const dayEnd = parse12h(CONFIG.businessHours.end);
  const totalMin = dayEnd - dayStart;

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const key = iso(d);
        const dayBookings = bookings.filter((b) => b.booking_date === key && b.status !== "declined" && b.status !== "cancelled");
        return (
          <div key={key} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5">
            <div className="text-sm font-semibold mb-2.5">{dayLabel(d)}</div>
            <div className="relative h-6 bg-[#0D0E10] rounded overflow-hidden mb-2">
              {dayBookings.map((b) => {
                const start = pgTimeToMinutes(b.start_time);
                const left = ((start - dayStart) / totalMin) * 100;
                const width = (b.duration_min / totalMin) * 100;
                return (
                  <div
                    key={b.id}
                    title={b.services?.name}
                    className={`absolute top-0 h-full bg-[#D4AF37]/80 ${b.status === "pending" ? "border border-dashed border-[#F5F5F6]" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
            </div>
            {dayBookings.length === 0 ? (
              <div className="text-[11px] text-[#5C5F66]">No bookings</div>
            ) : (
              <div className="space-y-1">
                {dayBookings.map((b) => (
                  <div key={b.id} className="text-[11px] text-[#8B8F96] flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 flex-1 min-w-0">
                      {b.type === "mobile" ? <Home size={10} /> : <Building2 size={10} />}
                      <span className="truncate">{b.services?.name}</span>
                      {b.status === "pending" && <span className="text-[#D4AF37] shrink-0"> · pending</span>}
                      {b.status === "completed" && <span className="text-[#5FCB7C] shrink-0"> · done</span>}
                    </span>
                    <span className="shrink-0">{minutesToDisplay(pgTimeToMinutes(b.start_time))}</span>
                    {b.status === "approved" && (
                      <button
                        disabled={busyId === b.id}
                        onClick={() => onAct(b.id, "completed")}
                        className="shrink-0 text-[10px] font-semibold text-[#C9CDD3] hover:text-white border border-[#232529] hover:border-[#4A4D53] px-2 py-1 rounded disabled:opacity-50"
                      >
                        Mark Complete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
