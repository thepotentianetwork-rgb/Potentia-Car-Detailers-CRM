import { supabase } from "../lib/supabaseClient.js";
import { requireTenantId } from "./tenantScope.js";

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
  mobileAddress, guestName, guestPhone, guestEmail, guestZip, addonIds,
}) {
  const ids = [...new Set((addonIds || []).filter(Boolean))];
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
    // Only sent when chosen, so a no-add-on booking is the same call as before.
    ...(ids.length > 0 && { p_addon_ids: ids }),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Staff "Add Booking" (ManualBookingForm): one database transaction creates
// the customer (if new), vehicle, approved booking and add-ons, and checks the
// FULL duration against business hours and other bookings.
export async function createManualBooking({
  tenantId, serviceId, bookingDate, startTime, type, vehicleLabel, profileId, newName, newPhone,
  staffId, mobileAddress, addonIds,
}) {
  requireTenantId(tenantId);
  const { data, error } = await supabase.rpc("create_manual_booking", {
    p_tenant_id: tenantId,
    p_service_id: serviceId,
    p_booking_date: bookingDate,
    p_start_time: startTime,
    p_type: type,
    p_vehicle_label: vehicleLabel,
    p_profile_id: profileId || null,
    p_new_name: profileId ? null : newName || null,
    p_new_phone: profileId ? null : newPhone || null,
    p_staff_id: staffId || null,
    p_mobile_address: type === "mobile" ? mobileAddress || null : null,
    p_addon_ids: [...new Set((addonIds || []).filter(Boolean))],
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Staff: move a pending/approved booking. The server re-checks the slot with
// the booking's full duration and keeps its status.
export async function rescheduleBooking(id, { bookingDate, startTime }) {
  const { data, error } = await supabase.rpc("reschedule_booking", {
    p_booking_id: id,
    p_new_date: bookingDate,
    p_new_start_time: startTime,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
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

// Every booking for one business (owner dashboard: requests, schedule,
// stats, customers, invoices).
const TENANT_BOOKING_COLS =
  "*,profiles!profile_id(full_name,phone,email,zip,source),staff:profiles!staff_id(full_name),services(name),vehicles(label,color)";
const ADDON_COLS = ",booking_addons(id,addon_id,name,price_cents,extra_duration_min)";

export async function fetchTenantBookings(tenantId) {
  requireTenantId(tenantId);
  const run = (cols) =>
    supabase
      .from("bookings")
      .select(cols)
      .eq("tenant_id", tenantId)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });
  let { data, error } = await run(TENANT_BOOKING_COLS + ADDON_COLS);
  // Before services-addons-migration.sql is applied there is no
  // booking_addons table; load the dashboard without add-ons instead of failing.
  if (error && /booking_addons/i.test(`${error.message} ${error.details || ""} ${error.hint || ""}`)) {
    ({ data, error } = await run(TENANT_BOOKING_COLS));
  }
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

// Staff: change service and add-ons on a booking. The server re-snapshots
// the add-ons, recomputes price and full duration, and rejects the change if
// the longer job would overlap another booking or run past closing.
export async function setBookingServiceAddons(id, { serviceId, addonIds }) {
  const { data, error } = await supabase.rpc("set_booking_service_addons", {
    p_booking_id: id,
    p_service_id: serviceId,
    p_addon_ids: [...new Set((addonIds || []).filter(Boolean))],
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
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
