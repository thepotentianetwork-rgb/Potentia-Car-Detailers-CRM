import { Check, Home, Building2 } from "lucide-react";
import { dayLabel, minutesToDisplay, pgTimeToMinutes } from "../../lib/time.js";

export function RequestsTab({ pending, busyId, onAct }) {
  return (
    <div className="space-y-2.5">
      {pending.length === 0 && <div className="text-center py-10 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">No pending requests.</div>}
      {pending.map((req) => (
        <div key={req.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5">
          <div className="flex items-start justify-between mb-1.5">
            <div>
              <div className="text-sm font-semibold">{req.profiles?.full_name || "Customer"}</div>
              <div className="text-[12px] text-[#C9CDD3] mt-0.5">{req.services?.name}</div>
            </div>
            <span style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[9px] font-bold uppercase tracking-wide bg-[#3D3315] text-[#D4AF37] px-2 py-1 rounded">Pending</span>
          </div>
          <div className="text-[12px] text-[#8B8F96] flex items-center gap-1.5 mb-3">
            {req.type === "mobile" ? <Home size={11} /> : <Building2 size={11} />}
            {dayLabel(new Date(req.booking_date + "T00:00:00"))} · {minutesToDisplay(pgTimeToMinutes(req.start_time))} · {req.duration_min} min
          </div>
          <div className="flex gap-2">
            <button disabled={busyId === req.id} onClick={() => onAct(req.id, "approved")} className="flex-1 flex items-center justify-center gap-1.5 bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] text-[12px] font-semibold py-2 rounded-md disabled:opacity-50"><Check size={12} /> Approve</button>
            <button disabled={busyId === req.id} onClick={() => onAct(req.id, "declined")} className="flex-1 text-[12px] font-medium text-[#8B8F96] hover:text-[#E08A8A] border border-[#232529] py-2 rounded-md disabled:opacity-50">Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
