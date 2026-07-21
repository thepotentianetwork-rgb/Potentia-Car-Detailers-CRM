import { useState, useEffect, useMemo } from "react";
import { X, Clock, Building2, Home, ChevronLeft, ChevronRight } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchServices } from "../../api/services.js";
import { fetchAvailability, createBooking } from "../../api/bookings.js";
import { createVehicle } from "../../api/vehicles.js";
import { fetchTenantCustomers, fetchTenantStaff, createGuestCustomer } from "../../api/profiles.js";
import { getAvailableStarts, getNextDays, iso, dayLabel, minutesToDisplay, minutesToPgTime } from "../../lib/time.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";

export function ManualBookingForm({ onClose, onCreated }) {
  const { tenant, config } = useTenant();
  const { profile } = useAuth();
  const days = getNextDays(6);

  const [customers, setCustomers] = useState(null);
  const [customerMode, setCustomerMode] = useState("new");
  const [existingCustomerId, setExistingCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [staffList, setStaffList] = useState(null);
  const [staffId, setStaffId] = useState("");

  const [services, setServices] = useState(null);
  const [serviceId, setServiceId] = useState(null);
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
  const service = services?.find((s) => s.id === serviceId);

  useEffect(() => {
    fetchTenantCustomers(tenant.id).then(setCustomers).catch((e) => setError(e.message));
    fetchServices(tenant.id)
      .then((s) => { setServices(s); setServiceId(s[0]?.id); })
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
    if (!service) return [];
    return getAvailableStarts(dayBookings, service.duration_min, type, config.businessHours, config.bookingGranularityMin, config.mobileTravelBufferMin);
  }, [dayBookings, service, type, config]);

  const submitBooking = async (startMinutes) => {
    if (customerMode === "new" && !newName.trim()) { setError("Enter the customer's name."); return; }
    if (customerMode === "existing" && !existingCustomerId) { setError("Select a customer."); return; }
    if (!vehicle.trim()) { setError("Enter their vehicle (e.g. 2021 Ford F-150)."); return; }
    if (type === "mobile" && !mobileAddress.trim()) { setError("Enter the address for mobile service."); return; }

    setSubmitting(true);
    setError("");
    try {
      const profileId =
        customerMode === "new"
          ? (await createGuestCustomer(tenant.id, newName.trim(), newPhone.trim())).id
          : existingCustomerId;

      const v = await createVehicle(profileId, vehicle.trim(), tenant.id);
      await createBooking({
        profile_id: profileId,
        service_id: service.id,
        vehicle_id: v.id,
        staff_id: staffId || null,
        tenant_id: tenant.id,
        booking_date: dateKey,
        start_time: minutesToPgTime(startMinutes),
        duration_min: service.duration_min,
        type,
        mobile_address: type === "mobile" ? mobileAddress.trim() : null,
        status: "approved",
        price_cents: service.price_cents,
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

            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Service</label>
            <select value={serviceId || ""} onChange={(e) => setServiceId(e.target.value)}
              className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5">
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} — ${(s.price_cents / 100).toFixed(0)}</option>)}
            </select>

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

            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Start Time</label>
            {error && <ErrorBox message={error} />}
            {loadingSlots ? (
              <LoadingBox />
            ) : availableStarts.length === 0 ? (
              <div className="text-center py-8 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg mb-2">No slots long enough for this service on this day.</div>
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
