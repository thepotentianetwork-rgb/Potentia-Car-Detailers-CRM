import { supabase } from "../lib/supabaseClient.js";

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function fetchTenantCustomers(tenantId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("tenant_id", tenantId)
    .eq("role", "customer")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchTenantStaff(tenantId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .in("role", ["business_owner", "staff"])
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createGuestCustomer(tenantId, fullName, phone) {
  const { data, error } = await supabase
    .from("profiles")
    .insert({ tenant_id: tenantId, full_name: fullName, phone: phone || null, role: "customer" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
