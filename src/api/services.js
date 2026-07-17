import { supabase } from "../lib/supabaseClient.js";

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
