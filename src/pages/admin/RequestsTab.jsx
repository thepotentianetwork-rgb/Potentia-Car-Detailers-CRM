import { useState } from "react";
import { Check, Home, Building2, Phone, Mail, Car, MapPin, Copy, CalendarClock, Plus } from "lucide-react";
import { dayLabel, minutesToDisplay, pgTimeToMinutes } from "../../lib/time.js";
import { formatPhone } from "../../lib/contact.js";
import { dollars, minutesText } from "../../lib/addons.js";
import { bookingLineItems } from "../../lib/bookingServices.js";
import { RescheduleForm } from "./RescheduleForm.jsx";

// The shop calls and texts from Google Voice, so phone numbers are shown with
// a Copy button. Never render tel: or sms: links here: they open the phone's
// own dialer/messages app instead of Google Voice.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / non-secure contexts: fall back to a hidden textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function PhoneWithCopy({ phone }) {
  const [status, setStatus] = useState("");
  const shown = formatPhone(phone);
  const copy = async () => {
    setStatus((await copyText(shown)) ? "Copied" : "Copy failed");
    setTimeout(() => setStatus(""), 1500);
  };
  return (
    <div className="flex items-center gap-1.5">
      <Phone size={11} className="shrink-0" />
      <span className="select-all text-[#C9CDD3]">{shown}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy phone number ${shown}`}
        className="ml-1 flex items-center gap-1 text-[11px] font-medium text-[#C9CDD3] border border-[#2A2C30] hover:border-[#4A4D53] px-2 py-0.5 rounded"
      >
        <Copy size={10} /> {status || "Copy"}
      </button>
    </div>
  );
}

// allBookings (every booking for the business) is needed to offer open
// reschedule slots; onRefresh reloads after a move.
export function RequestsTab({ pending, busyId, onAct, allBookings = pending, onRefresh = () => {} }) {
  const [reschedulingId, setReschedulingId] = useState(null);
  return (
    <div className="space-y-2.5">
      {pending.length === 0 && <div className="text-center py-10 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">No pending requests.</div>}
      {pending.map((req) => {
        const p = req.profiles || {};
        const v = req.vehicles;
        const isGuest = p.source === "guest";
        return (
          <div key={req.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  {p.full_name || "Customer"}
                  {isGuest && (
                    <span style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[9px] font-bold uppercase tracking-wide bg-[#1E2A3D] text-[#8FB3E8] px-1.5 py-0.5 rounded">Guest</span>
                  )}
                </div>
                {(() => {
                  const items = bookingLineItems(req);
                  if (items.length === 1) return <div className="text-[12px] text-[#C9CDD3] mt-0.5">{items[0].name}</div>;
                  // several services (or a service + add-ons from the add-on era): one line each
                  return (
                    <ul className="text-[12px] text-[#C9CDD3] mt-0.5" aria-label="Services">
                      {items.map((i, n) => (
                        <li key={i.key} className="flex items-center gap-1">
                          {n > 0 && <Plus size={9} />} {i.name} {dollars(i.price_cents)}{i.duration_min ? ` (${i.addon ? "+" : ""}${i.duration_min} min)` : ""}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
              <span style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[9px] font-bold uppercase tracking-wide bg-[#3D3315] text-[#D4AF37] px-2 py-1 rounded">Pending</span>
            </div>
            <div className="text-[12px] text-[#8B8F96] flex items-center gap-1.5 mb-2">
              {req.type === "mobile" ? <Home size={11} /> : <Building2 size={11} />}
              {dayLabel(new Date(req.booking_date + "T00:00:00"))} · {minutesToDisplay(pgTimeToMinutes(req.start_time))} · {minutesText(req.duration_min)} · {dollars(req.price_cents)} total
            </div>
            <div className="text-[12px] text-[#8B8F96] space-y-1 mb-3">
              {p.phone && <PhoneWithCopy phone={p.phone} />}
              {p.email && (
                <div className="flex items-center gap-1.5"><Mail size={11} className="shrink-0" /> <span className="select-all break-all">{p.email}</span></div>
              )}
              {v?.label && (
                <div className="flex items-center gap-1.5"><Car size={11} className="shrink-0" /> {v.label}{v.color ? ` · ${v.color}` : ""}</div>
              )}
              {req.type === "mobile" && req.mobile_address && (
                <div className="flex items-start gap-1.5"><MapPin size={11} className="shrink-0 mt-0.5" /> <span>{req.mobile_address}{p.zip ? ` · ${p.zip}` : ""}</span></div>
              )}
              {!(req.type === "mobile" && req.mobile_address) && p.zip && (
                <div className="flex items-center gap-1.5"><MapPin size={11} className="shrink-0" /> ZIP {p.zip}</div>
              )}
            </div>
            {reschedulingId === req.id && (
              <div className="mb-2">
                <RescheduleForm
                  booking={req}
                  allBookings={allBookings}
                  onCancel={() => setReschedulingId(null)}
                  onSaved={() => { setReschedulingId(null); onRefresh(); }}
                />
              </div>
            )}
            <div className="flex gap-2">
              <button disabled={busyId === req.id} onClick={() => setReschedulingId(reschedulingId === req.id ? null : req.id)} aria-label="Reschedule"
                className="flex items-center justify-center gap-1 text-[12px] font-medium text-[#C9CDD3] border border-[#232529] hover:border-[#4A4D53] px-2.5 py-2 rounded-md disabled:opacity-50"><CalendarClock size={12} /> Reschedule</button>
              <button disabled={busyId === req.id} onClick={() => onAct(req.id, "approved")} className="flex-1 flex items-center justify-center gap-1.5 bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] text-[12px] font-semibold py-2 rounded-md disabled:opacity-50"><Check size={12} /> Approve</button>
              <button disabled={busyId === req.id} onClick={() => onAct(req.id, "declined")} className="flex-1 text-[12px] font-medium text-[#8B8F96] hover:text-[#E08A8A] border border-[#232529] py-2 rounded-md disabled:opacity-50">Decline</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
