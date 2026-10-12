import { supabase } from "../lib/supabaseClient.js";
import { requireTenantId } from "./tenantScope.js";

// Public list: active services only (the database also hides inactive ones
// from the public).
export async function fetchServices(tenantId) {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("active", true)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

// Owner dashboard: every service, including inactive ones.
export async function fetchAllServices(tenantId) {
  requireTenantId(tenantId);
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

// Services are never deleted (past bookings point at them); set active=false.
export async function createService(tenantId, fields) {
  requireTenantId(tenantId);
  const { data, error } = await supabase.from("services").insert({ ...fields, tenant_id: tenantId }).select().single();
  if (error) throw error;
  return data;
}

export async function updateService(id, fields) {
  const { data, error } = await supabase.from("services").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
