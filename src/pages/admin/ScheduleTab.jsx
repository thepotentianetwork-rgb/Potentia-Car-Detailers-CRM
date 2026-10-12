import { useState, useEffect } from "react";
import { Home, Building2, Pencil, Receipt, Plus, CalendarClock } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { getNextDays, iso, dayLabel, minutesToDisplay, pgTimeToMinutes, parse12h, bookingBusyInterval } from "../../lib/time.js";
import { fetchAllServices, fetchAddons } from "../../api/services.js";
import { setBookingServiceAddons } from "../../api/bookings.js";
import { addonTotals, bookingAddons, dollars, minutesText } from "../../lib/addons.js";
import { AddonChecklist } from "../../components/AddonChecklist.jsx";
import { RescheduleForm, isLive } from "./RescheduleForm.jsx";
import { InvoiceModal } from "../../components/InvoiceModal.jsx";
import { ManualBookingForm } from "./ManualBookingForm.jsx";

export function ScheduleTab({ bookings, busyId, onAct, onRefresh }) {
  const { tenant, config } = useTenant();
  const days = getNextDays(6);
  const dayStart = parse12h(config.businessHours.start);
  const dayEnd = parse12h(config.businessHours.end);
  const totalMin = dayEnd - dayStart;

  const [services, setServices] = useState(null);
  const [addons, setAddons] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [reschedulingId, setReschedulingId] = useState(null);
  const [invoiceBooking, setInvoiceBooking] = useState(null);
  const [addingBooking, setAddingBooking] = useState(false);

  useEffect(() => {
    fetchAllServices(tenant.id).then(setServices).catch(() => {});
    Promise.resolve()
      .then(() => fetchAddons(tenant.id, { includeInactive: true }))
      .then((a) => setAddons(a || []))
      .catch(() => setAddons([]));
  }, [tenant.id]);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setAddingBooking(true)}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white py-2.5 rounded-lg transition-colors"
      >
        <Plus size={14} /> Add Booking
      </button>

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
                // duration_min is the FULL job (service + add-ons).
                const width = (b.duration_min / totalMin) * 100;
                return (
                  <div
                    key={b.id}
                    data-testid="timeline-bar"
                    title={`${b.services?.name || "Booking"} · ${minutesText(b.duration_min)}`}
                    className={`absolute top-0 h-full bg-[#D4AF37]/80 ${b.status === "pending" ? "border border-dashed border-[#F5F5F6]" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
            </div>
            {dayBookings.length === 0 ? (
              <div className="text-[11px] text-[#5C5F66]">No bookings</div>
            ) : (
              <div className="space-y-1.5">
                {dayBookings.map((b) =>
                  editingId === b.id ? (
                    <ServiceEditForm
                      key={b.id}
                      booking={b}
                      services={services}
                      addons={addons}
                      allBookings={bookings}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        onRefresh();
                      }}
                    />
                  ) : reschedulingId === b.id ? (
                    <RescheduleForm
                      key={b.id}
                      booking={b}
                      allBookings={bookings}
                      onCancel={() => setReschedulingId(null)}
                      onSaved={() => {
                        setReschedulingId(null);
                        onRefresh();
                      }}
                    />
                  ) : (
                    <div key={b.id} className="text-[11px] text-[#8B8F96] flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 flex-1 min-w-0">
                        {b.type === "mobile" ? <Home size={10} /> : <Building2 size={10} />}
                        <span className="truncate">
                          {b.services?.name}
                          {bookingAddons(b).length > 0 && ` + ${bookingAddons(b).map((a) => a.name).join(" + ")}`}
                        </span>
                        {b.staff?.full_name && <span className="shrink-0"> · {b.staff.full_name}</span>}
                        {b.status === "pending" && <span className="text-[#D4AF37] shrink-0"> · pending</span>}
                        {b.status === "completed" && <span className="text-[#5FCB7C] shrink-0"> · done</span>}
                      </span>
                      <span className="shrink-0">{minutesToDisplay(pgTimeToMinutes(b.start_time))} · {minutesText(b.duration_min)}</span>
                      {(b.status === "pending" || b.status === "approved") && (
                        <button
                          onClick={() => setEditingId(b.id)}
                          title="Change service / add-ons (upsell)"
                          aria-label="Change service / add-ons"
                          className="shrink-0 text-[#5C5F66] hover:text-[#C9CDD3]"
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                      {(b.status === "pending" || b.status === "approved") && (
                        <button
                          onClick={() => setReschedulingId(b.id)}
                          title="Reschedule"
                          aria-label="Reschedule"
                          className="shrink-0 text-[#5C5F66] hover:text-[#C9CDD3]"
                        >
                          <CalendarClock size={11} />
                        </button>
                      )}
                      {b.status === "approved" && (
                        <button
                          disabled={busyId === b.id}
                          onClick={() => onAct(b.id, "completed")}
                          className="shrink-0 text-[10px] font-semibold text-[#C9CDD3] hover:text-white border border-[#232529] hover:border-[#4A4D53] px-2 py-1 rounded disabled:opacity-50"
                        >
                          Mark Complete
                        </button>
                      )}
                      {b.status === "completed" && (
                        <button
                          onClick={() => setInvoiceBooking(b)}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-[#C9CDD3] hover:text-white border border-[#232529] hover:border-[#4A4D53] px-2 py-1 rounded"
                        >
                          <Receipt size={10} /> Invoice
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}

      {invoiceBooking && <InvoiceModal booking={invoiceBooking} onClose={() => setInvoiceBooking(null)} />}
      {addingBooking && (
        <ManualBookingForm
          onClose={() => setAddingBooking(false)}
          onCreated={() => {
            setAddingBooking(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

// Does a job of durationMin at the booking's current time run past closing
// or into another live booking that day? Mirrors the server check so the
// owner sees why before saving; set_booking_service_addons() enforces it.
export function editConflict(booking, durationMin, allBookings, config) {
  const start = pgTimeToMinutes(booking.start_time);
  if (start + durationMin > parse12h(config.businessHours.end)) {
    return `This ${minutesText(durationMin)} job would run past closing. Reschedule it earlier first.`;
  }
  const buffer = config.mobileTravelBufferMin;
  const [cs, ce] = bookingBusyInterval({ ...booking, duration_min: durationMin }, buffer);
  const hit = (allBookings || []).find((o) => o.id !== booking.id && o.booking_date === booking.booking_date && isLive(o) && (() => {
    const [os, oe] = bookingBusyInterval(o, buffer);
    return cs < oe && ce > os;
  })());
  if (hit) {
    return `This ${minutesText(durationMin)} job would overlap ${hit.services?.name || "another booking"} at ${minutesToDisplay(pgTimeToMinutes(hit.start_time))}. Reschedule one of them first.`;
  }
  return "";
}

function ServiceEditForm({ booking, services, addons, allBookings, onCancel, onSaved }) {
  const { config } = useTenant();
  const [serviceId, setServiceId] = useState(booking.service_id);
  const current = bookingAddons(booking).map((a) => a.addon_id).filter(Boolean);
  const [addonIds, setAddonIds] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Inactive services/add-ons are hidden unless already on this booking.
  const serviceChoices = (services || []).filter((s) => s.active !== false || s.id === booking.service_id);
  const addonChoices = (addons || []).filter((a) => a.active !== false || current.includes(a.id));
  const service = serviceChoices.find((s) => s.id === serviceId);
  const totals = addonTotals(service, addonChoices, addonIds);
  const conflict = service && (booking.status === "pending" || booking.status === "approved")
    ? editConflict(booking, totals.durationMin, allBookings, config)
    : "";

  const save = async () => {
    if (!service || conflict) return;
    setSaving(true);
    setError("");
    try {
      await setBookingServiceAddons(booking.id, { serviceId: service.id, addonIds: totals.selected.map((a) => a.id) });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#0D0E10] border border-[#232529] rounded-lg p-2.5 space-y-2">
      {!services ? (
        <div className="text-[11px] text-[#5C5F66]">Loading services…</div>
      ) : (
        <>
          <select
            aria-label="Service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full bg-[#111214] border border-[#232529] rounded-md px-2 py-1.5 text-[11px] outline-none"
          >
            {serviceChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — ${(s.price_cents / 100).toFixed(0)}
              </option>
            ))}
          </select>
          <AddonChecklist addons={addonChoices} selectedIds={addonIds} onChange={setAddonIds} />
          {service && (
            <div data-testid="edit-total" className="text-[11px] text-[#8B8F96]">
              Total: {dollars(totals.priceCents)} · {minutesText(totals.durationMin)}
            </div>
          )}
          {conflict && <div role="alert" className="text-[10px] text-[#E08A8A]">{conflict}</div>}
          {error && <div className="text-[10px] text-[#E08A8A]">{error}</div>}
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={saving || !!conflict}
              className="flex-1 text-[10px] font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white py-1.5 rounded disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onCancel} className="flex-1 text-[10px] text-[#8B8F96] border border-[#232529] py-1.5 rounded">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
