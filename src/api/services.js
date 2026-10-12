import { supabase } from "../lib/supabaseClient.js";
import { requireTenantId } from "./tenantScope.js";

// Public list: active services only (the database also hides inactive ones
// from the public once services-addons-migration.sql is applied).
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

// Add-on catalog. Public callers get active add-ons only (RLS); the owner
// passes includeInactive to manage them.
export async function fetchAddons(tenantId, { includeInactive = false } = {}) {
  requireTenantId(tenantId);
  let q = supabase.from("service_addons").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q.order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createAddon(tenantId, fields) {
  requireTenantId(tenantId);
  const { data, error } = await supabase.from("service_addons").insert({ ...fields, tenant_id: tenantId }).select().single();
  if (error) throw error;
  return data;
}

export async function updateAddon(id, fields) {
  const { data, error } = await supabase.from("service_addons").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
