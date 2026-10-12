import { supabase } from "../lib/supabaseClient.js";
import { requireTenantId } from "./tenantScope.js";

const uniqueIds = (ids) => [...new Set((ids || []).filter(Boolean))];

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
  tenantSlug, serviceIds, bookingDate, startTime, type, vehicleLabel, vehicleColor,
  mobileAddress, guestName, guestPhone, guestEmail, guestZip,
}) {
  const ids = uniqueIds(serviceIds);
  const { data, error } = await supabase.rpc("request_booking", {
    p_tenant_slug: tenantSlug,
    // First service doubles as bookings.service_id; the full list is summed server-side.
    p_service_id: ids[0] || null,
    p_service_ids: ids,
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

// Staff "Add Booking" (ManualBookingForm): one database transaction creates
// the customer (if new), vehicle, approved booking and its services, and
// checks the FULL combined duration against business hours and other bookings.
export async function createManualBooking({
  tenantId, serviceIds, bookingDate, startTime, type, vehicleLabel, profileId, newName, newPhone,
  staffId, mobileAddress,
}) {
  requireTenantId(tenantId);
  const ids = uniqueIds(serviceIds);
  const { data, error } = await supabase.rpc("create_manual_booking", {
    p_tenant_id: tenantId,
    p_service_id: ids[0] || null,
    p_service_ids: ids,
    p_booking_date: bookingDate,
    p_start_time: startTime,
    p_type: type,
    p_vehicle_label: vehicleLabel,
    p_profile_id: profileId || null,
    p_new_name: profileId ? null : newName || null,
    p_new_phone: profileId ? null : newPhone || null,
    p_staff_id: staffId || null,
    p_mobile_address: type === "mobile" ? mobileAddress || null : null,
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
// booking_addons: history from the add-on era (still shown on old bookings).
// booking_services: one snapshot row per service on multi-service bookings.
const ADDON_COLS = ",booking_addons(id,addon_id,name,price_cents,extra_duration_min)";
const SERVICE_COLS = ",booking_services(id,service_id,name,price_cents,duration_min,position)";
const missingTable = (error, table) =>
  error && new RegExp(table, "i").test(`${error.message} ${error.details || ""} ${error.hint || ""}`);

export async function fetchTenantBookings(tenantId) {
  requireTenantId(tenantId);
  const run = (cols) =>
    supabase
      .from("bookings")
      .select(cols)
      .eq("tenant_id", tenantId)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });
  let { data, error } = await run(TENANT_BOOKING_COLS + ADDON_COLS + SERVICE_COLS);
  // Before multiservice-migration.sql is applied there is no booking_services
  // table; load the dashboard without it instead of failing.
  if (missingTable(error, "booking_services")) {
    ({ data, error } = await run(TENANT_BOOKING_COLS + ADDON_COLS));
  }
  if (missingTable(error, "booking_addons")) {
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

// Staff: change the services on a booking. The server re-snapshots them,
// recomputes price and full duration, and rejects the change if the longer
// job would overlap another booking or run past closing.
export async function setBookingServices(id, { serviceIds }) {
  const { data, error } = await supabase.rpc("set_booking_services", {
    p_booking_id: id,
    p_service_ids: uniqueIds(serviceIds),
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
