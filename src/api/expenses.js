import { supabase } from "../lib/supabaseClient.js";

const RECEIPTS_BUCKET = "receipts";

export async function fetchExpenses() {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createExpense(expense) {
  const { data, error } = await supabase.from("expenses").insert(expense).select().single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id, receiptPath) {
  if (receiptPath) {
    await supabase.storage.from(RECEIPTS_BUCKET).remove([receiptPath]);
  }
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadReceipt(file, tenantId) {
  const ext = file.name.split(".").pop();
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

export async function getReceiptUrl(path) {
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
