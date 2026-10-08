import { useState, useEffect, useMemo } from "react";
import { Clock, Building2, Home, ChevronLeft, ChevronRight } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { fetchServices } from "../api/services.js";
import { fetchAvailability, requestBooking } from "../api/bookings.js";
import { getAvailableStarts, getNextDays, iso, dayLabel, minutesToDisplay, minutesToPgTime, earliestStartFor } from "../lib/time.js";
import { normalizePhone, formatPhone, isValidZip, isValidEmail } from "../lib/contact.js";
import { useBranding, priceLabel } from "../tenants/branding.js";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBox } from "../components/ErrorBox.jsx";

const inputCls = "w-full bg-[var(--brand-input)] border border-[var(--brand-border)] rounded-lg px-3.5 py-2.5 text-sm outline-none";
const labelCls = "text-[11px] uppercase tracking-wide text-[var(--brand-muted)] mb-1.5 block";

// Used by signed-in customers and by guests (guest=true, no session). Both
// book through request_booking(); guests also give name / phone / email / ZIP.
export function BookingFlow({ guest = false, onConfirm }) {
  const { tenant, config } = useTenant();
  const branding = useBranding();
  const closedWeekdays = branding.closedWeekdays;
  // The next 6 days the business is open. Days are local-noon Dates holding
  // the business's calendar date, so getDay() is the business's weekday.
  // 14 days covers today..+13, the window request_booking() accepts.
  const days = useMemo(
    () => getNextDays(14, config.timezone).filter((d) => !closedWeekdays.includes(d.getDay())).slice(0, 6),
    [config.timezone, closedWeekdays]
  );
  const [services, setServices] = useState(null);
  const [serviceId, setServiceId] = useState(null);
  const [type, setType] = useState("dropoff");
  const [vehicle, setVehicle] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [mobileAddress, setMobileAddress] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestZip, setGuestZip] = useState("");
  // Honeypot: hidden from people, but form-filling bots tend to fill it in.
  const [website, setWebsite] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [dayBookings, setDayBookings] = useState([]);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedDay = days[dayIndex];
  const dateKey = iso(selectedDay);
  const service = services?.find((s) => s.id === serviceId);
  // Today, hide start times that already passed (plus the lead time) in the
  // business's timezone; the server enforces the same rule.
  const minStart = earliestStartFor(dateKey, new Date(), config.timezone);

  useEffect(() => {
    fetchServices(tenant.id)
      .then((s) => { setServices(s); setServiceId(s[0]?.id); })
      .catch((e) => setError(e.message));
  }, [tenant.id]);

  useEffect(() => {
    setLoadingSlots(true);
    fetchAvailability(dateKey, tenant.id)
      .then(setDayBookings)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingSlots(false));
  }, [dateKey, tenant.id, slotsVersion]);

  const availableStarts = useMemo(() => {
    if (!service) return [];
    return getAvailableStarts(dayBookings, service.duration_min, type, config.businessHours, config.bookingGranularityMin, config.mobileTravelBufferMin, minStart);
  }, [dayBookings, service, type, config, minStart]);

  const validate = () => {
    if (guest) {
      if (guestName.trim().length < 2) return "Enter your name.";
      if (!normalizePhone(guestPhone)) return "Enter a 10-digit mobile phone number.";
      if (guestEmail.trim() && !isValidEmail(guestEmail)) return "Enter a valid email or leave it blank.";
      if (type === "mobile" && !guestZip.trim()) return "Enter your ZIP code for mobile service.";
      if (guestZip.trim() && !isValidZip(guestZip)) return "Enter a 5-digit ZIP code.";
    }
    if (vehicle.trim().length < 2) return "Enter your vehicle (e.g. 2021 Ford F-150).";
    if (type === "mobile" && mobileAddress.trim().length < 5) return "Enter the address for mobile service.";
    return "";
  };

  const submitBooking = async (startMinutes) => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    const confirmation = {
      dateLabel: dayLabel(selectedDay),
      time: minutesToDisplay(startMinutes),
      service: service.name,
      type,
      guest,
      name: guest ? guestName.trim() : undefined,
      phone: guest ? formatPhone(guestPhone) : undefined,
    };
    // A filled honeypot means a bot: look successful, send nothing.
    if (guest && website) { onConfirm(confirmation); return; }
    setSubmitting(true);
    setError("");
    try {
      await requestBooking({
        tenantSlug: tenant.slug,
        serviceId: service.id,
        bookingDate: dateKey,
        startTime: minutesToPgTime(startMinutes),
        type,
        vehicleLabel: vehicle.trim(),
        vehicleColor: vehicleColor.trim(),
        mobileAddress: mobileAddress.trim(),
        ...(guest && {
          guestName: guestName.trim(),
          guestPhone: normalizePhone(guestPhone),
          guestEmail: guestEmail.trim(),
          guestZip: guestZip.trim(),
        }),
      });
      onConfirm(confirmation);
    } catch (e) {
      setError(e.message);
      // The slot may have just been taken; reload so it disappears.
      setSlotsVersion((v) => v + 1);
    } finally {
      setSubmitting(false);
    }
  };

  if (!services) return <LoadingBox center />;

  return (
    <main className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
      <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-lg font-bold mb-1">Book a Service</h1>
      {guest ? (
        <p className="text-[13px] text-[var(--brand-muted)] mb-5">No account needed. Pick a time and {config.businessName} will reach out to confirm.</p>
      ) : (
        <div className="mb-3" />
      )}

      {guest && (
        <>
          <label htmlFor="guest-name" className={labelCls}>Name</label>
          <input id="guest-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="First and last name"
            autoComplete="name" required className={`${inputCls} mb-3.5`} />

          <label htmlFor="guest-phone" className={labelCls}>Mobile phone</label>
          <input id="guest-phone" type="tel" inputMode="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="(555) 123-4567" autoComplete="tel" required className={`${inputCls} mb-3.5`} />

          <div className="flex gap-2.5 mb-5">
            <div className="flex-[2]">
              <label htmlFor="guest-email" className={labelCls}>Email (optional)</label>
              <input id="guest-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" className={inputCls} />
            </div>
            <div className="flex-1">
              <label htmlFor="guest-zip" className={labelCls}>{type === "mobile" ? "ZIP" : "ZIP (optional)"}</label>
              <input id="guest-zip" inputMode="numeric" maxLength={5} value={guestZip} onChange={(e) => setGuestZip(e.target.value)}
                placeholder={branding.zipPlaceholder} autoComplete="postal-code" className={inputCls} />
            </div>
          </div>

          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="guest-website">Website</label>
            <input id="guest-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </>
      )}

      <div className="flex gap-2.5 mb-5">
        <div className="flex-[2]">
          <label htmlFor="vehicle" className={labelCls}>Vehicle</label>
          <input id="vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. 2021 Ford F-150" className={inputCls} />
        </div>
        <div className="flex-1">
          <label htmlFor="vehicle-color" className={labelCls}>Color (optional)</label>
          <input id="vehicle-color" maxLength={30} value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} placeholder="e.g. Black" className={inputCls} />
        </div>
      </div>

      <label className="text-[11px] uppercase tracking-wide text-[var(--brand-muted)] mb-1.5 block">Service</label>
      <select value={serviceId || ""} onChange={(e) => setServiceId(e.target.value)}
        className="w-full bg-[var(--brand-input)] border border-[var(--brand-border)] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5">
        {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {priceLabel(s, branding)}</option>)}
      </select>

      <label className="text-[11px] uppercase tracking-wide text-[var(--brand-muted)] mb-1.5 block">Drop-off or Mobile</label>
      <div className="flex gap-2.5 mb-2">
        <button onClick={() => setType("dropoff")} className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border transition-colors ${type === "dropoff" ? "border-[var(--brand-soft)] text-[var(--brand-text)]" : "border-[var(--brand-border)] text-[var(--brand-muted)]"}`}>
          <Building2 size={13} /> Drop-off
        </button>
        <button onClick={() => setType("mobile")} className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border transition-colors ${type === "mobile" ? "border-[var(--brand-soft)] text-[var(--brand-text)]" : "border-[var(--brand-border)] text-[var(--brand-muted)]"}`}>
          <Home size={13} /> Mobile
        </button>
      </div>
      {type === "mobile" && (
        <input aria-label="Address for mobile service" value={mobileAddress} onChange={(e) => setMobileAddress(e.target.value)} placeholder="Address for mobile service"
          autoComplete="street-address" className={`${inputCls} mb-5 mt-2`} />
      )}
      {type !== "mobile" && branding.contact?.address && (
        <p className="text-[12px] text-[var(--brand-muted)] mt-2 mb-5">Drop-off at {branding.contact.address}</p>
      )}
      {type !== "mobile" && !branding.contact?.address && <div className="mb-3" />}

      <label className="text-[11px] uppercase tracking-wide text-[var(--brand-muted)] mb-1.5 block">Date</label>
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => setDayIndex((i) => Math.max(0, i - 1))} disabled={dayIndex === 0} className="p-1.5 border border-[var(--brand-border)] rounded-md text-[var(--brand-muted)] disabled:opacity-30"><ChevronLeft size={14} /></button>
        <div className="flex-1 text-center bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-lg py-2.5 text-sm font-medium">{dayLabel(selectedDay)}</div>
        <button onClick={() => setDayIndex((i) => Math.min(days.length - 1, i + 1))} disabled={dayIndex === days.length - 1} className="p-1.5 border border-[var(--brand-border)] rounded-md text-[var(--brand-muted)] disabled:opacity-30"><ChevronRight size={14} /></button>
      </div>

      <label className="text-[11px] uppercase tracking-wide text-[var(--brand-muted)] mb-1.5 block">Available Start Times</label>
      {error && <ErrorBox message={error} />}
      {loadingSlots ? (
        <LoadingBox />
      ) : availableStarts.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-[var(--brand-subtle)] border border-dashed border-[var(--brand-border)] rounded-lg mb-2">No slots long enough for this service on this day.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 mb-2">
          {availableStarts.map((mins) => (
            <button key={mins} disabled={submitting} onClick={() => submitBooking(mins)}
              className="flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border border-[var(--brand-border)] hover:border-[var(--brand-border-hover)] transition-colors disabled:opacity-50">
              <Clock size={12} /> {minutesToDisplay(mins)}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
