import { supabase } from "../lib/supabaseClient.js";

export async function fetchServices() {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}
