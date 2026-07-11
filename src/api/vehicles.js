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
