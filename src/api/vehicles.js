import { supabase } from "../lib/supabaseClient.js";
import { requireTenantId } from "./tenantScope.js";

export async function createVehicle(profileId, label, tenantId) {
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ profile_id: profileId, label, is_primary: true, tenant_id: tenantId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchTenantVehicles(tenantId) {
  requireTenantId(tenantId);
  const { data, error } = await supabase.from("vehicles").select("*").eq("tenant_id", tenantId);
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
