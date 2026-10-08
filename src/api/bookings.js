import { supabase } from "../lib/supabaseClient.js";

export async function fetchAvailability(date, tenantId) {
  const { data, error } = await supabase
    .from("public_availability")
    .select("*")
    .eq("booking_date", date)
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return data;
}

// Customer portal bookings (guests and signed-in customers) go through the
// request_booking() database function, which sets price, duration and
// status itself and re-checks the slot. Error messages it raises are written
// for customers, so they can be shown as-is.
export async function requestBooking({
  tenantSlug, serviceId, bookingDate, startTime, type, vehicleLabel, vehicleColor,
  mobileAddress, guestName, guestPhone, guestEmail, guestZip,
}) {
  const { data, error } = await supabase.rpc("request_booking", {
    p_tenant_slug: tenantSlug,
    p_service_id: serviceId,
    p_booking_date: bookingDate,
    p_start_time: startTime,
    p_type: type,
    p_vehicle_label: vehicleLabel,
    p_vehicle_color: vehicleColor || null,
    p_mobile_address: type === "mobile" ? mobileAddress || null : null,
    p_guest_name: guestName || null,
    p_guest_phone: guestPhone || null,
    p_guest_email: guestEmail || null,
    p_guest_zip: guestZip || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Staff-only path (ManualBookingForm): direct insert under staff RLS policies.
export async function createBooking(booking) {
  const { data, error } = await supabase.from("bookings").insert(booking).select().single();
  if (error) throw error;
  return data;
}

export async function fetchMyBookings(userId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*,services(name)")
    .eq("profile_id", userId)
    .order("booking_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchAllBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*,profiles!profile_id(full_name,phone,email,zip,source),staff:profiles!staff_id(full_name),services(name),vehicles(label,color)"
    )
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateBookingStatus(id, status) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data;
}

export async function updateBookingService(id, { serviceId, durationMin, priceCents }) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ service_id: serviceId, duration_min: durationMin, price_cents: priceCents })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data;
}

export async function updateBookingPayment(id, { paid, paymentMethod }) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ paid, payment_method: paid ? paymentMethod : null })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data;
}
