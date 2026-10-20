// Mobile detailing needs a service address: street, city and ZIP at minimum.
// The three fields are joined into bookings.mobile_address as
// "street, city ZIP", the shape the server's is_service_address() accepts.
export const emptyServiceAddress = { street: "", city: "", zip: "" };

const clean = (s) => String(s || "").trim().replace(/\s+/g, " ").replace(/,/g, " ").replace(/\s+/g, " ").trim();

export function serviceAddressError(a) {
  if (clean(a.street).length < 3 || !/[0-9a-z]/i.test(a.street)) return "Enter the street address for mobile service.";
  if (clean(a.city).length < 2 || !/[a-z]/i.test(a.city)) return "Enter the city for mobile service.";
  if (!/^\d{5}(-\d{4})?$/.test(String(a.zip || "").trim())) return "Enter the 5-digit ZIP for mobile service.";
  return "";
}

export function composeServiceAddress(a) {
  return `${clean(a.street)}, ${clean(a.city)} ${String(a.zip).trim()}`;
}

export const zipOf = (a) => String(a.zip || "").trim().slice(0, 5);
