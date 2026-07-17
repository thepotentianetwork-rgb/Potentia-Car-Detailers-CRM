import { supabase } from "../lib/supabaseClient.js";

export async function fetchTenantBySlug(slug) {
  const { data, error } = await supabase.from("tenants").select("*").eq("slug", slug).single();
  if (error) throw error;
  return data;
}

export async function fetchAllTenants() {
  const { data, error } = await supabase.from("tenants").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
