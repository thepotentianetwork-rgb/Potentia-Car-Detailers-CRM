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

async function compressImage(file, { maxDimension = 1600, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image compression produced no output."))),
      "image/jpeg",
      quality
    );
  });
}

export async function uploadVehiclePhoto(file, tenantId) {
  let uploadBlob = file;
  let ext = file.name.split(".").pop();
  try {
    uploadBlob = await compressImage(file);
    ext = "jpg";
  } catch {
    // Fall back to the original file if the browser can't decode/compress it.
  }

  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, uploadBlob, { contentType: uploadBlob.type || file.type });
  if (error) throw error;
  return supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}
