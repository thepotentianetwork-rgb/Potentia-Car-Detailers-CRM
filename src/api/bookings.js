import { supabase } from "../lib/supabaseClient.js";

export async function fetchAvailability(date) {
  const { data, error } = await supabase
    .from("public_availability")
    .select("*")
    .eq("booking_date", date);
  if (error) throw error;
  return data;
}

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
    .select("*,profiles(full_name,phone),services(name)")
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
