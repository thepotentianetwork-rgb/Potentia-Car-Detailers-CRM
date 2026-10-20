import { useState, useEffect } from "react";
import { Home, Building2, Pencil, Receipt, Plus, CalendarClock } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { BOOKING_WINDOW_DAYS, getNextDays, iso, dayLabel, minutesToDisplay, pgTimeToMinutes, parse12h, bookingBusyInterval } from "../../lib/time.js";
import { fetchAllServices } from "../../api/services.js";
import { setBookingServices } from "../../api/bookings.js";
import { bookingAddons, dollars, minutesText } from "../../lib/addons.js";
import { serviceTotals, bookingTitle, bookingServiceIds } from "../../lib/bookingServices.js";
import { ServicePicker } from "../../components/ServicePicker.jsx";
import { RescheduleForm, isLive } from "./RescheduleForm.jsx";
import { InvoiceModal } from "../../components/InvoiceModal.jsx";
import { ManualBookingForm } from "./ManualBookingForm.jsx";

export function ScheduleTab({ bookings, busyId, onAct, onRefresh }) {
  const { tenant, config } = useTenant();
  // Next 6 days by default; "Show more days" extends through the booking window
  // so jobs booked months ahead can still be found, edited and rescheduled.
  const [span, setSpan] = useState(6);
  const days = getNextDays(span, config.timezone);
  const dayStart = parse12h(config.businessHours.start);
  const dayEnd = parse12h(config.businessHours.end);
  const totalMin = dayEnd - dayStart;

  const [services, setServices] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [reschedulingId, setReschedulingId] = useState(null);
  const [invoiceBooking, setInvoiceBooking] = useState(null);
  const [addingBooking, setAddingBooking] = useState(false);

  useEffect(() => {
    fetchAllServices(tenant.id).then(setServices).catch(() => {});
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
                // duration_min is the FULL job (every service on it).
                const width = (b.duration_min / totalMin) * 100;
                return (
                  <div
                    key={b.id}
                    data-testid="timeline-bar"
                    title={`${bookingTitle(b) || "Booking"} · ${minutesText(b.duration_min)}`}
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
                        <span className="truncate">{bookingTitle(b)}{b.type === "mobile" && b.mobile_address ? ` · ${b.mobile_address}` : ""}</span>
                        {b.staff?.full_name && <span className="shrink-0"> · {b.staff.full_name}</span>}
                        {b.status === "pending" && <span className="text-[#D4AF37] shrink-0"> · pending</span>}
                        {b.status === "completed" && <span className="text-[#5FCB7C] shrink-0"> · done</span>}
                      </span>
                      <span className="shrink-0">{minutesToDisplay(pgTimeToMinutes(b.start_time))} · {minutesText(b.duration_min)}</span>
                      {(b.status === "pending" || b.status === "approved") && (
                        <button
                          onClick={() => setEditingId(b.id)}
                          title="Change services (upsell)"
                          aria-label="Change services"
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

      {span <= BOOKING_WINDOW_DAYS && (() => {
        const later = bookings.filter((b) => b.booking_date > iso(days[days.length - 1]) && (b.status === "pending" || b.status === "approved")).length;
        return (
          <button onClick={() => setSpan((n) => Math.min(BOOKING_WINDOW_DAYS + 1, n + 14))}
            className="w-full text-[12px] font-medium text-[#C9CDD3] border border-[#232529] hover:border-[#4A4D53] py-2.5 rounded-lg">
            Show more days{later ? ` (${later} later booking${later === 1 ? "" : "s"})` : ""}
          </button>
        );
      })()}

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
// owner sees why before saving; set_booking_services() enforces it.
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
    return `This ${minutesText(durationMin)} job would overlap ${bookingTitle(hit) || "another booking"} at ${minutesToDisplay(pgTimeToMinutes(hit.start_time))}. Reschedule one of them first.`;
  }
  return "";
}

function ServiceEditForm({ booking, services, allBookings, onCancel, onSaved }) {
  const { config } = useTenant();
  const current = bookingServiceIds(booking);
  const [serviceIds, setServiceIds] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Inactive services are hidden unless already on this booking.
  // Services already on it keep the price/minutes they were booked at (the
  // server keeps that snapshot too).
  const snapshot = new Map((booking.booking_services || []).map((r) => [r.service_id, r]));
  const serviceChoices = (services || [])
    .filter((s) => s.active !== false || current.includes(s.id))
    .map((s) => (snapshot.has(s.id) ? { ...s, price_cents: snapshot.get(s.id).price_cents, duration_min: snapshot.get(s.id).duration_min } : s));
  // Add-ons from the add-on era stay on the booking (and in its total).
  const legacyAddons = bookingAddons(booking);
  const totals = serviceTotals(serviceChoices, serviceIds);
  const priceCents = totals.priceCents + legacyAddons.reduce((s, a) => s + (a.price_cents || 0), 0);
  const durationMin = totals.durationMin + legacyAddons.reduce((s, a) => s + (a.extra_duration_min || 0), 0);
  const picked = totals.selected.length > 0;
  const conflict = picked && (booking.status === "pending" || booking.status === "approved")
    ? editConflict(booking, durationMin, allBookings, config)
    : "";

  const save = async () => {
    if (!picked || conflict) return;
    setSaving(true);
    setError("");
    try {
      await setBookingServices(booking.id, { serviceIds: totals.selected.map((s) => s.id) });
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
          <ServicePicker services={serviceChoices} selectedIds={serviceIds} onChange={setServiceIds} variant="admin" />
          {legacyAddons.length > 0 && (
            <div className="text-[11px] text-[#8B8F96]">Kept from the original booking: {legacyAddons.map((a) => a.name).join(", ")}</div>
          )}
          <div data-testid="edit-total" className="text-[11px] text-[#8B8F96]">
            {picked ? `Total: ${dollars(priceCents)} · ${minutesText(durationMin)}` : "Pick at least one service."}
          </div>
          {conflict && <div role="alert" className="text-[10px] text-[#E08A8A]">{conflict}</div>}
          {error && <div className="text-[10px] text-[#E08A8A]">{error}</div>}
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={saving || !!conflict || !picked}
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
