// Contact-field helpers shared by the booking, signup and owner screens.
// The rules mirror request_booking() / handle_new_user() in
// guest-booking-migration.sql so customers see the problem before submitting.

// "(555) 201-0001", "555.201.0001", "+1 555 201 0001" -> "5552010001".
// Returns null unless it's a 10-digit US number.
export function normalizePhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

// "5552010001" -> "(555) 201-0001". Anything that isn't a 10-digit number
// (older staff-entered phones are free text) is returned trimmed, unchanged.
export function formatPhone(raw) {
  const digits = normalizePhone(raw);
  if (!digits) return String(raw ?? "").trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const isValidZip = (zip) => /^\d{5}$/.test(String(zip ?? "").trim());

export const isValidEmail = (email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? "").trim());
