import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Mail, Car, CalendarClock, ExternalLink, Receipt, CalendarPlus } from "lucide-react";
import { useTenant } from "../../../context/TenantContext.jsx";
import { fetchTenantVehicles } from "../../../api/vehicles.js";
import { customerRows } from "../../../lib/analytics.js";
import { bookingTitle } from "../../../lib/bookingServices.js";
import { iso, dayLabel, minutesToDisplay, pgTimeToMinutes } from "../../../lib/time.js";
import { formatPhone } from "../../../lib/contact.js";
import { LoadingBox } from "../../../components/LoadingBox.jsx";
import { ErrorBox } from "../../../components/ErrorBox.jsx";
import { InvoiceModal } from "../../../components/InvoiceModal.jsx";
import { PhoneWithCopy } from "../RequestsTab.jsx";
import { RescheduleForm } from "../RescheduleForm.jsx";
import { ManualBookingForm } from "../ManualBookingForm.jsx";
import { VehicleNotes } from "../CustomersTab.jsx";
import { SOURCE_LABELS } from "../../../lib/analytics.js";
import { StatusPill, Panel, Empty, money, timeAgo } from "./ui.jsx";

const day = (key) => dayLabel(new Date(key + "T12:00:00"));

// The shop calls and texts from Google Voice: never tel:/sms: links. Phone
// numbers get a Copy button plus a link to the Google Voice web app.
const GOOGLE_VOICE_URL = "https://voice.google.com/u/0/messages";

export function matchesQuery(c, q) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\D/g, "");
  return (
    c.name.toLowerCase().includes(s) ||
    (c.email || "").toLowerCase().includes(s) ||
    (c.vehicle || "").toLowerCase().includes(s) ||
    (digits.length >= 3 && String(c.phone || "").replace(/\D/g, "").includes(digits))
  );
}

export function CustomersView({ bookings, tenantId, query, onQuery, onRefresh }) {
  const { config } = useTenant();
  const [vehicles, setVehicles] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    fetchTenantVehicles(tenantId).then(setVehicles).catch((e) => setError(e.message));
  }, [tenantId]);

  const today = iso(new Date(), config.timezone);
  const rows = useMemo(() => customerRows(bookings, today), [bookings, today]);
  const shown = rows.filter((c) => matchesQuery(c, query));
  const open = rows.find((c) => c.profileId === openId);

  if (error) return <ErrorBox message={error} />;
  if (!vehicles) return <LoadingBox center />;
  if (open) {
    return <CustomerDetails customer={open} vehicles={vehicles.filter((v) => v.profile_id === open.profileId)} allBookings={bookings}
      onBack={() => setOpenId(null)} onRefresh={onRefresh} />;
  }

  return (
    <div className="bg-[#F4F5F7] text-[#1A1B1E] rounded-xl border border-[#D9DBDF] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E2E4E8]">
        <div className="text-[13px] text-[#55585E]">{shown.length} of {rows.length} customer{rows.length === 1 ? "" : "s"}</div>
        {query && <button onClick={() => onQuery("")} className="text-[12px] text-[#1F4E8C] hover:underline">Clear search</button>}
      </div>
      {rows.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[#6E7176]">No customers yet. They show up here after their first booking.</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[#6E7176]">No customers match "{query}".</div>
      ) : (
        <>
          <table className="hidden md:table w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#6E7176] bg-[#ECEDF0]">
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Vehicle</th>
                <th className="px-4 py-2.5 font-semibold">Latest service</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">Spend</th>
                <th className="px-4 py-2.5 font-semibold text-right">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.profileId} onClick={() => setOpenId(c.profileId)} className="border-t border-[#E2E4E8] hover:bg-white cursor-pointer">
                  <td className="px-4 py-3 font-semibold"><button className="text-left hover:underline" onClick={() => setOpenId(c.profileId)}>{c.name}</button></td>
                  <td className="px-4 py-3 text-[#3B3D42]">{c.vehicle || "—"}</td>
                  <td className="px-4 py-3 text-[#3B3D42] max-w-[260px] truncate">{bookingTitle(c.latest)}</td>
                  <td className="px-4 py-3"><StatusPill light status={c.latest.status} /></td>
                  <td className="px-4 py-3 text-right font-medium">{money(c.spendCents)}</td>
                  <td className="px-4 py-3 text-right text-[#6E7176]">{c.lastActivity ? timeAgo(c.lastActivity) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="md:hidden divide-y divide-[#E2E4E8]">
            {shown.map((c) => (
              <li key={c.profileId}>
                <button onClick={() => setOpenId(c.profileId)} className="w-full text-left px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold">{c.name}</div>
                    <div className="text-[12px] text-[#55585E] truncate">{c.vehicle || bookingTitle(c.latest)}</div>
                  </div>
                  <StatusPill light status={c.latest.status} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CustomerDetails({ customer: c, vehicles, allBookings, onBack, onRefresh }) {
  const [tab, setTab] = useState("overview");
  const [rescheduling, setRescheduling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const lastCompleted = c.history[0];

  const upcoming = (
    <Panel title="Upcoming Appointment">
      {!c.upcoming ? <Empty>No upcoming appointment.</Empty> : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CalendarClock size={18} className="text-[#C3C7CD]" />
              <div>
                <div className="text-[13px] font-semibold">{day(c.upcoming.booking_date)} · {minutesToDisplay(pgTimeToMinutes(c.upcoming.start_time))}</div>
                <div className="text-[12px] text-[#8E9196]">{bookingTitle(c.upcoming)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={c.upcoming.status} />
              <button onClick={() => setRescheduling((r) => !r)} className="text-[12px] font-semibold border border-[#3A3B40] hover:border-[#6E7176] px-3 py-1.5 rounded-lg">Reschedule</button>
            </div>
          </div>
          {rescheduling && (
            <div className="mt-3">
              <RescheduleForm booking={c.upcoming} allBookings={allBookings} onCancel={() => setRescheduling(false)}
                onSaved={() => { setRescheduling(false); onRefresh(); }} />
            </div>
          )}
        </>
      )}
    </Panel>
  );

  const history = (
    <Panel title="Service History">
      {c.history.length === 0 ? <Empty>No completed jobs yet.</Empty> : (
        <ul className="divide-y divide-[#232327]">
          {c.history.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span className="min-w-0 truncate">{bookingTitle(b)}</span>
              <span className="flex items-center gap-3 shrink-0 text-[#8E9196]">{day(b.booking_date)} <span className="text-[#ECEDEF] font-semibold">{money(b.price_cents)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  const notes = (
    <Panel title="Notes">
      {vehicles.length === 0 ? <Empty>No vehicles on file yet.</Empty> : (
        <div className="space-y-3">{vehicles.map((v) => <VehicleNotes key={v.id} vehicle={v} />)}</div>
      )}
    </Panel>
  );

  const appointments = (
    <Panel title="All Appointments">
      <ul className="divide-y divide-[#232327]">
        {[...c.bookings].reverse().map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
            <div className="min-w-0">
              <div className="truncate">{bookingTitle(b)}</div>
              <div className="text-[11px] text-[#8E9196]">{day(b.booking_date)} · {minutesToDisplay(pgTimeToMinutes(b.start_time))} · {money(b.price_cents)}</div>
            </div>
            <StatusPill status={b.status} />
          </li>
        ))}
      </ul>
    </Panel>
  );

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-[#C3C7CD] hover:text-white"><ArrowLeft size={14} /> All customers</button>
      <div className="bg-[#131315] border border-[#26262A] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#3A3B40] to-[#1A1A1D] border border-[#4A4B50] flex items-center justify-center text-[18px] font-bold text-[#E6E8EB]">
          {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="text-[20px] font-bold">{c.name}</h2>
          <div className="text-[12px] text-[#8E9196] space-y-1">
            {c.phone && <PhoneWithCopy phone={c.phone} />}
            {c.email && <div className="flex items-center gap-1.5"><Mail size={11} /> <span className="select-all break-all">{c.email}</span></div>}
            {c.vehicle && <div className="flex items-center gap-1.5"><Car size={11} /> {c.vehicle}</div>}
            {c.source && <div>Came in: {SOURCE_LABELS[c.source] || c.source}</div>}
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <div><div className="text-[20px] font-bold">{c.visits}</div><div className="text-[11px] text-[#8E9196]">Completed jobs</div></div>
          <div><div className="text-[20px] font-bold">{money(c.spendCents)}</div><div className="text-[11px] text-[#8E9196]">Lifetime</div></div>
        </div>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-[#26262A]">
        {[["overview", "Overview"], ["appointments", "Appointments"], ["notes", "Notes"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-[13px] -mb-px border-b-2 ${tab === k ? "border-[#C3C7CD] text-white" : "border-transparent text-[#8E9196] hover:text-[#C3C7CD]"}`}>{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">{notes}{upcoming}</div>
          <div className="space-y-4">
            {history}
            <Panel title="Quick Actions">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAdding(true)} className="flex items-center justify-center gap-1.5 text-[12px] font-semibold bg-gradient-to-b from-[#E6E8EB] to-[#B9BDC3] text-[#0A0A0B] py-2.5 rounded-lg"><CalendarPlus size={13} /> Add booking</button>
                <button disabled={!lastCompleted} onClick={() => setInvoice(lastCompleted)} className="flex items-center justify-center gap-1.5 text-[12px] font-semibold border border-[#3A3B40] hover:border-[#6E7176] py-2.5 rounded-lg disabled:opacity-40"><Receipt size={13} /> Last invoice</button>
                {c.phone && (
                  <a href={GOOGLE_VOICE_URL} target="_blank" rel="noreferrer" className="col-span-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold border border-[#3A3B40] hover:border-[#6E7176] py-2.5 rounded-lg">
                    <ExternalLink size={13} /> Open Google Voice ({formatPhone(c.phone)})
                  </a>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}
      {tab === "appointments" && appointments}
      {tab === "notes" && notes}

      {adding && <ManualBookingForm onClose={() => setAdding(false)} onCreated={() => { setAdding(false); onRefresh(); }} />}
      {invoice && <InvoiceModal booking={invoice} onClose={() => setInvoice(null)} />}
    </div>
  );
}
