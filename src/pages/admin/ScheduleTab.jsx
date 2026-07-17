import { useState, useEffect } from "react";
import { Home, Building2, Pencil, Receipt } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { getNextDays, iso, dayLabel, minutesToDisplay, pgTimeToMinutes, parse12h } from "../../lib/time.js";
import { fetchServices } from "../../api/services.js";
import { updateBookingService } from "../../api/bookings.js";
import { InvoiceModal } from "../../components/InvoiceModal.jsx";

export function ScheduleTab({ bookings, busyId, onAct, onRefresh }) {
  const { tenant, config } = useTenant();
  const days = getNextDays(6);
  const dayStart = parse12h(config.businessHours.start);
  const dayEnd = parse12h(config.businessHours.end);
  const totalMin = dayEnd - dayStart;

  const [services, setServices] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [invoiceBooking, setInvoiceBooking] = useState(null);

  useEffect(() => {
    fetchServices(tenant.id).then(setServices).catch(() => {});
  }, [tenant.id]);

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
              <div className="space-y-1.5">
                {dayBookings.map((b) =>
                  editingId === b.id ? (
                    <ServiceEditForm
                      key={b.id}
                      booking={b}
                      services={services}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        onRefresh();
                      }}
                    />
                  ) : (
                    <div key={b.id} className="text-[11px] text-[#8B8F96] flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 flex-1 min-w-0">
                        {b.type === "mobile" ? <Home size={10} /> : <Building2 size={10} />}
                        <span className="truncate">{b.services?.name}</span>
                        {b.status === "pending" && <span className="text-[#D4AF37] shrink-0"> · pending</span>}
                        {b.status === "completed" && <span className="text-[#5FCB7C] shrink-0"> · done</span>}
                      </span>
                      <span className="shrink-0">{minutesToDisplay(pgTimeToMinutes(b.start_time))}</span>
                      {(b.status === "pending" || b.status === "approved") && (
                        <button
                          onClick={() => setEditingId(b.id)}
                          title="Change service (upsell)"
                          className="shrink-0 text-[#5C5F66] hover:text-[#C9CDD3]"
                        >
                          <Pencil size={11} />
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
    </div>
  );
}

function ServiceEditForm({ booking, services, onCancel, onSaved }) {
  const [serviceId, setServiceId] = useState(booking.service_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    setSaving(true);
    setError("");
    try {
      await updateBookingService(booking.id, {
        serviceId: service.id,
        durationMin: service.duration_min,
        priceCents: service.price_cents,
      });
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
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full bg-[#111214] border border-[#232529] rounded-md px-2 py-1.5 text-[11px] outline-none"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — ${(s.price_cents / 100).toFixed(0)}
              </option>
            ))}
          </select>
          {error && <div className="text-[10px] text-[#E08A8A]">{error}</div>}
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={saving}
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
