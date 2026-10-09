// Owner alert for new portal booking requests, sent to a per-business
// Formspree form (bookingAlertFormspreeUrl in src/tenants/<slug>.js), which
// emails the owner. The CRM itself sends no email.
//
// Why from the browser: request_booking() runs in the database and the app
// has no server-side mailer or Supabase service key (the only /api function
// is the vehicle-description one). Formspree endpoints are public by design
// (Juan's site already posts to this one from the browser), so this exposes
// nothing new. The booking is already saved before this runs, and every
// failure here is swallowed, so an alert problem can't block or undo a
// booking. Trade-off: an alert can be lost if the request fails (keepalive
// covers closing the tab). The sturdier long-term option is a database
// trigger (pg_net) or a server function, which needs a production change.

export const FORMSPREE_URL_RE = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/;

const longDate = (dateKey) =>
  // dateKey is the business's YYYY-MM-DD; noon UTC keeps the weekday right.
  new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });

// Plain fields for the email. `_subject` and `_replyto` are Formspree's.
export function buildBookingAlert({
  businessName, guest, customerName, phone, email, zip, vehicle, vehicleColor,
  service, price, type, mobileAddress, dateKey, time, notes, ownerLink, bookingId,
}) {
  const payload = {
    _subject: `New booking request - ${businessName}`,
    business: businessName,
    status: "Pending: approve or decline it in the CRM",
    customer_name: customerName || "Not provided",
    customer_type: guest ? "Guest (no account)" : "Customer account",
    phone: phone || "Not provided",
    email: email || "Not provided",
    vehicle: vehicleColor ? `${vehicle} (${vehicleColor})` : vehicle,
    vehicle_color: vehicleColor || "Not provided",
    service,
    price,
    service_mode: type === "mobile" ? "Mobile" : "Drop-off",
    address: type === "mobile" ? mobileAddress || "Not provided" : "N/A (drop-off)",
    date: longDate(dateKey),
    start_time: time,
  };
  if (zip) payload.zip = zip;
  if (notes) payload.notes = notes;
  if (ownerLink) payload.owner_requests_link = `${ownerLink} (Requests tab)`;
  if (bookingId) payload.booking_id = bookingId;
  if (email) payload._replyto = email;
  return payload;
}

// Resolves true if Formspree accepted it, false otherwise (no URL, bad URL,
// network error, non-2xx). Never throws or rejects.
export function sendBookingAlert(url, payload, fetchImpl = globalThis.fetch) {
  if (!url) return Promise.resolve(false);
  if (!FORMSPREE_URL_RE.test(url)) {
    console.warn("Booking alert skipped: not a Formspree form URL:", url);
    return Promise.resolve(false);
  }
  return Promise.resolve()
    .then(() =>
      fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      })
    )
    .then((res) => {
      if (!res?.ok) console.warn("Booking alert not accepted by Formspree:", res?.status);
      return !!res?.ok;
    })
    .catch((e) => {
      console.warn("Booking alert failed:", e?.message || e);
      return false;
    });
}
