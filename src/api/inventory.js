import { supabase } from "../lib/supabaseClient.js";

const PHOTOS_BUCKET = "vehicle-photos";

export async function fetchInventory(tenantId) {
  const { data, error } = await supabase
    .from("inventory_vehicles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createVehicle(vehicle) {
  const { data, error } = await supabase.from("inventory_vehicles").insert(vehicle).select().single();
  if (error) throw error;
  return data;
}

export async function updateVehicle(id, fields) {
  const { data, error } = await supabase.from("inventory_vehicles").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteVehicle(id, photoPaths) {
  if (photoPaths?.length) {
    await supabase.storage.from(PHOTOS_BUCKET).remove(photoPaths);
  }
  const { error } = await supabase.from("inventory_vehicles").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadVehiclePhoto(file, tenantId) {
  const ext = file.name.split(".").pop();
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file);
  if (error) throw error;
  return supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}
