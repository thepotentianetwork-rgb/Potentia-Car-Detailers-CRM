import { useState, useEffect, useMemo } from "react";
import { X, Clock, Building2, Home, ChevronLeft, ChevronRight } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchServices } from "../../api/services.js";
import { fetchAvailability, createManualBooking } from "../../api/bookings.js";
import { fetchTenantCustomers, fetchTenantStaff } from "../../api/profiles.js";
import { dollars, minutesText } from "../../lib/addons.js";
import { serviceTotals } from "../../lib/bookingServices.js";
import { ServicePicker } from "../../components/ServicePicker.jsx";
import { JumpToDate } from "../../components/JumpToDate.jsx";
import { getAvailableStarts, getBookingDays, iso, dayLabel, minutesToDisplay, minutesToPgTime, earliestStartFor } from "../../lib/time.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";

export function ManualBookingForm({ onClose, onCreated }) {
  const { tenant, config } = useTenant();
  const { profile } = useAuth();
  // Staff can book any day in the booking window (create_manual_booking has no upper limit).
  const days = useMemo(() => getBookingDays(config.timezone), [config.timezone]);

  const [customers, setCustomers] = useState(null);
  const [customerMode, setCustomerMode] = useState("new");
  const [existingCustomerId, setExistingCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [staffList, setStaffList] = useState(null);
  const [staffId, setStaffId] = useState("");

  const [services, setServices] = useState(null);
  const [serviceIds, setServiceIds] = useState([]);
  const [vehicle, setVehicle] = useState("");
  const [type, setType] = useState("dropoff");
  const [mobileAddress, setMobileAddress] = useState("");

  const [dayIndex, setDayIndex] = useState(0);
  const [dayBookings, setDayBookings] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedDay = days[dayIndex];
  const dateKey = iso(selectedDay);
  // Slots must fit the whole job: every checked service.
  const totals = serviceTotals(services, serviceIds);
  const picked = totals.selected.length > 0;
  // Today, hide slots that already started (business timezone). No lead time
  // for staff, so a walk-in can still be put in the next open slot.
  const minStart = earliestStartFor(dateKey, new Date(), config.timezone, 0);

  useEffect(() => {
    fetchTenantCustomers(tenant.id).then(setCustomers).catch((e) => setError(e.message));
    fetchServices(tenant.id)
      .then((s) => { setServices(s); setServiceIds(s[0] ? [s[0].id] : []); })
      .catch((e) => setError(e.message));
    fetchTenantStaff(tenant.id)
      .then((s) => { setStaffList(s); if (profile && s.some((p) => p.id === profile.id)) setStaffId(profile.id); })
      .catch((e) => setError(e.message));
  }, [tenant.id]);

  useEffect(() => {
    setLoadingSlots(true);
    fetchAvailability(dateKey, tenant.id)
      .then(setDayBookings)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingSlots(false));
  }, [dateKey, tenant.id]);

  const availableStarts = useMemo(() => {
    if (!picked) return [];
    return getAvailableStarts(dayBookings, totals.durationMin, type, config.businessHours, config.bookingGranularityMin, config.mobileTravelBufferMin, minStart);
  }, [dayBookings, picked, totals.durationMin, type, config, minStart]);

  const submitBooking = async (startMinutes) => {
    if (!picked) { setError("Pick at least one service."); return; }
    if (customerMode === "new" && !newName.trim()) { setError("Enter the customer's name."); return; }
    if (customerMode === "existing" && !existingCustomerId) { setError("Select a customer."); return; }
    if (!vehicle.trim()) { setError("Enter their vehicle (e.g. 2021 Ford F-150)."); return; }
    if (type === "mobile" && !mobileAddress.trim()) { setError("Enter the address for mobile service."); return; }

    setSubmitting(true);
    setError("");
    try {
      // One server call: customer, vehicle, approved booking and services are
      // saved together (or not at all), and the slot is re-checked.
      await createManualBooking({
        tenantId: tenant.id,
        serviceIds: totals.selected.map((s) => s.id),
        bookingDate: dateKey,
        startTime: minutesToPgTime(startMinutes),
        type,
        vehicleLabel: vehicle.trim(),
        profileId: customerMode === "existing" ? existingCustomerId : null,
        newName: customerMode === "new" ? newName.trim() : null,
        newPhone: customerMode === "new" ? newPhone.trim() : null,
        staffId: staffId || null,
        mobileAddress: mobileAddress.trim(),
      });
      onCreated();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8" onClick={onClose}>
      <div
        className="bg-[#0A0A0B] text-[#F5F5F6] w-full max-w-md rounded-xl border border-[#232529] p-5 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8B8F96] hover:text-[#F5F5F6]">
          <X size={18} />
        </button>
        <h2 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-lg font-bold mb-4">Add Booking</h2>
        <p className="text-[12px] text-[#8B8F96] mb-5">For a customer who called or texted in — no account needed, but you can still track their history.</p>

        {(!customers || !services || !staffList) ? (
          <LoadingBox center />
        ) : (
          <>
            <div className="flex gap-2.5 mb-4">
              <button onClick={() => setCustomerMode("new")} className={`flex-1 text-sm py-2.5 rounded-lg border transition-colors ${customerMode === "new" ? "border-[#C9CDD3] text-[#F5F5F6]" : "border-[#232529] text-[#8B8F96]"}`}>
                New Customer
              </button>
              <button onClick={() => setCustomerMode("existing")} className={`flex-1 text-sm py-2.5 rounded-lg border transition-colors ${customerMode === "existing" ? "border-[#C9CDD3] text-[#F5F5F6]" : "border-[#232529] text-[#8B8F96]"}`}>
                Existing Customer
              </button>
            </div>

            {customerMode === "new" ? (
              <>
                <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Customer Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jamie Rivera"
                  className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-3.5" />
                <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Phone (optional)</label>
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="e.g. (555) 123-4567"
                  className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5" />
              </>
            ) : (
              <>
                <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Customer</label>
                {customers.length === 0 ? (
                  <div className="text-[12px] text-[#5C5F66] mb-5">No existing customers yet — use "New Customer" instead.</div>
                ) : (
                  <select value={existingCustomerId} onChange={(e) => setExistingCustomerId(e.target.value)}
                    className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5">
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` — ${c.phone}` : ""}</option>
                    ))}
                  </select>
                )}
              </>
            )}

            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Vehicle</label>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. 2021 Ford F-150"
              className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5" />

            <ServicePicker services={services} selectedIds={serviceIds} onChange={setServiceIds} variant="admin" className="mb-2" />
            <div data-testid="manual-total" className="text-[12px] text-[#8B8F96] mb-5">
              {picked ? `Total: ${dollars(totals.priceCents)} · ${minutesText(totals.durationMin)}` : "Pick at least one service."}
            </div>

            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Detailer</label>
            {staffList.length === 0 ? (
              <div className="text-[12px] text-[#5C5F66] mb-5">No staff accounts on file yet.</div>
            ) : (
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
                className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5">
                <option value="">Unassigned</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            )}

            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Drop-off or Mobile</label>
            <div className="flex gap-2.5 mb-2">
              <button onClick={() => setType("dropoff")} className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border transition-colors ${type === "dropoff" ? "border-[#C9CDD3] text-[#F5F5F6]" : "border-[#232529] text-[#8B8F96]"}`}>
                <Building2 size={13} /> Drop-off
              </button>
              <button onClick={() => setType("mobile")} className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border transition-colors ${type === "mobile" ? "border-[#C9CDD3] text-[#F5F5F6]" : "border-[#232529] text-[#8B8F96]"}`}>
                <Home size={13} /> Mobile
              </button>
            </div>
            {type === "mobile" && (
              <input value={mobileAddress} onChange={(e) => setMobileAddress(e.target.value)} placeholder="Address for mobile service"
                className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5 mt-2" />
            )}
            {type !== "mobile" && <div className="mb-3" />}

            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Date</label>
            <div className="flex items-center gap-2 mb-5">
              <button onClick={() => setDayIndex((i) => Math.max(0, i - 1))} disabled={dayIndex === 0} className="p-1.5 border border-[#232529] rounded-md text-[#8B8F96] disabled:opacity-30"><ChevronLeft size={14} /></button>
              <div className="flex-1 text-center bg-[#111214] border border-[#232529] rounded-lg py-2.5 text-sm font-medium">{dayLabel(selectedDay)}</div>
              <button onClick={() => setDayIndex((i) => Math.min(days.length - 1, i + 1))} disabled={dayIndex === days.length - 1} className="p-1.5 border border-[#232529] rounded-md text-[#8B8F96] disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
            <JumpToDate days={days} index={dayIndex} onPick={setDayIndex}
              className="-mt-3 mb-5 w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3 py-2 text-[13px] outline-none [color-scheme:dark]" />

            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Start Time</label>
            {error && <ErrorBox message={error} />}
            {loadingSlots ? (
              <LoadingBox />
            ) : availableStarts.length === 0 ? (
              <div className="text-center py-8 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg mb-2">{!picked
                  ? "Pick at least one service to see open times."
                  : `No open time on this day fits ${minutesText(totals.durationMin)}.`}</div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 mb-2">
                {availableStarts.map((mins) => (
                  <button key={mins} disabled={submitting} onClick={() => submitBooking(mins)}
                    className="flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border border-[#232529] hover:border-[#4A4D53] transition-colors disabled:opacity-50">
                    <Clock size={12} /> {minutesToDisplay(mins)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
