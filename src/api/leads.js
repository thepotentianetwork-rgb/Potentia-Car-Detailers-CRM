import { supabase } from "../lib/supabaseClient.js";

export async function fetchLeads() {
  const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLead(lead) {
  const { data, error } = await supabase.from("leads").insert(lead).select().single();
  if (error) throw error;
  return data;
}

export async function updateLead(id, fields) {
  const { data, error } = await supabase.from("leads").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLead(id) {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchLeadTasks() {
  const { data, error } = await supabase.from("lead_tasks").select("*").order("due_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createLeadTask(task) {
  const { data, error } = await supabase.from("lead_tasks").insert(task).select().single();
  if (error) throw error;
  return data;
}

export async function updateLeadTask(id, fields) {
  const { data, error } = await supabase.from("lead_tasks").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLeadTask(id) {
  const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
  if (error) throw error;
}
