import { supabase } from "../lib/supabaseClient.js";

export async function createVehicle(profileId, label) {
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ profile_id: profileId, label, is_primary: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAllVehicles() {
  const { data, error } = await supabase.from("vehicles").select("*");
  if (error) throw error;
  return data;
}

export async function updateVehicleNotes(id, notes) {
  const { data, error } = await supabase
    .from("vehicles")
    .update({ notes })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
