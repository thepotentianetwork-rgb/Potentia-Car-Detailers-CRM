import { useState, useEffect, useMemo } from "react";
import { Clock, Building2, Home, ChevronLeft, ChevronRight } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { fetchServices } from "../api/services.js";
import { fetchAvailability, requestBooking } from "../api/bookings.js";
import { getAvailableStarts, getNextDays, iso, dayLabel, minutesToDisplay, minutesToPgTime, earliestStartFor } from "../lib/time.js";
import { normalizePhone, formatPhone, isValidZip, isValidEmail } from "../lib/contact.js";
import { useBranding, priceLabel } from "../tenants/branding.js";
import { buildBookingAlert, sendBookingAlert } from "../lib/bookingAlert.js";
import { minutesText } from "../lib/addons.js";
import { serviceTotals } from "../lib/bookingServices.js";
import { ServicePicker } from "../components/ServicePicker.jsx";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBox } from "../components/ErrorBox.jsx";

const inputCls = "w-full bg-[var(--brand-input)] border border-[var(--brand-border)] rounded-lg px-3.5 py-2.5 text-sm outline-none";
const labelCls = "text-[11px] uppercase tracking-wide text-[var(--brand-muted)] mb-1.5 block";

// Used by signed-in customers and by guests (guest=true, no session). Both
// book through request_booking(); guests also give name / phone / email / ZIP.
// `customer` ({ name, phone, email }) is the signed-in customer, used only for
// the owner's email alert.
export function BookingFlow({ guest = false, customer = null, onConfirm }) {
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
  // Any number of services in one booking; the first is preselected.
  const [serviceIds, setServiceIds] = useState([]);
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
  // Price and length of the WHOLE job (every chosen service). Open slots are
  // computed with the total so the booking fits; the server re-checks it.
  const totals = serviceTotals(services, serviceIds);
  const picked = totals.selected.length > 0;
  const serviceNames = totals.selected.map((s) => s.name).join(" + ");
  // "From $X" pricing (tenant file) carries over when any chosen service has it.
  const totalLabel = (cents) =>
    totals.selected.some((s) => priceLabel(s, branding).startsWith("From")) ? `From $${(cents / 100).toFixed(0)}` : `$${(cents / 100).toFixed(0)}`;
  // Today, hide start times that already passed (plus the lead time) in the
  // business's timezone; the server enforces the same rule.
  const minStart = earliestStartFor(dateKey, new Date(), config.timezone);

  useEffect(() => {
    fetchServices(tenant.id)
      .then((s) => { setServices(s); setServiceIds(s[0] ? [s[0].id] : []); })
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
    if (!picked) return [];
    return getAvailableStarts(dayBookings, totals.durationMin, type, config.businessHours, config.bookingGranularityMin, config.mobileTravelBufferMin, minStart);
  }, [dayBookings, picked, totals.durationMin, type, config, minStart]);

  const validate = () => {
    if (!picked) return "Pick at least one service.";
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
      service: serviceNames,
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
      const created = await requestBooking({
        tenantSlug: tenant.slug,
        serviceIds: totals.selected.map((s) => s.id),
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
      alertOwner(created, startMinutes);
      onConfirm(confirmation);
    } catch (e) {
      setError(e.message);
      // The slot may have just been taken; reload so it disappears.
      setSlotsVersion((v) => v + 1);
    } finally {
      setSubmitting(false);
    }
  };

  // Fire-and-forget email to the owner. The booking is already saved; nothing
  // here may throw into the booking flow or delay the confirmation.
  const alertOwner = (created, startMinutes) => {
    try {
      const url = branding.bookingAlertFormspreeUrl;
      if (!url) return;
      const payload = buildBookingAlert({
        businessName: config.businessName,
        guest,
        customerName: guest ? guestName.trim() : customer?.name,
        phone: formatPhone(guest ? guestPhone : customer?.phone ?? ""),
        email: guest ? guestEmail.trim() : customer?.email,
        zip: guest ? guestZip.trim() : undefined,
        vehicle: vehicle.trim(),
        vehicleColor: vehicleColor.trim(),
        service: serviceNames,
        price: totalLabel(totals.priceCents),
        ...(totals.selected.length > 1 && {
          services: totals.selected,
          totalPrice: totalLabel(totals.priceCents),
        }),
        totalDuration: minutesText(totals.durationMin),
        type,
        mobileAddress: mobileAddress.trim(),
        dateKey,
        time: minutesToDisplay(startMinutes),
        ownerLink: `${window.location.origin}/crm/${tenant.slug}`,
        bookingId: created?.booking_id,
      });
      sendBookingAlert(url, payload);
    } catch (e) {
      console.warn("Booking alert failed:", e?.message || e);
    }
  };

  if (!services) return <LoadingBox center />;

  return (
    <main className="flex-1 px-5 py-6 lg:py-10 max-w-md lg:max-w-3xl mx-auto w-full">
      <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-lg font-bold mb-1">Book a Service</h1>
      {guest ? (
        <p className="text-[13px] text-[var(--brand-muted)] mb-5">No account needed. Pick a time and {config.businessName} will reach out to confirm.</p>
      ) : (
        <div className="mb-3" />
      )}

      {/* Phones: one column. Desktop: contact, vehicle and drop-off/mobile on
          the left; services, date and start times on the right. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start">
      <div data-testid="booking-col-details">
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

      </div>
      <div data-testid="booking-col-time">
      <ServicePicker services={services} selectedIds={serviceIds} onChange={setServiceIds}
        priceText={(s) => priceLabel(s, branding)} className="mb-2" />
      <p data-testid="booking-total" className="text-[12px] text-[var(--brand-muted)] mb-5">
        {picked ? `Total: ${totalLabel(totals.priceCents)} · ${minutesText(totals.durationMin)}` : "Pick at least one service."}
      </p>

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
        <div className="text-center py-8 text-[13px] text-[var(--brand-subtle)] border border-dashed border-[var(--brand-border)] rounded-lg mb-2">{!picked
            ? "Pick at least one service to see open times."
            : totals.selected.length > 1
            ? `No open time on this day fits ${serviceNames} (${minutesText(totals.durationMin)}). Try another day or fewer services.`
            : "No slots long enough for this service on this day."}</div>
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
      </div>
      </div>
    </main>
  );
}
