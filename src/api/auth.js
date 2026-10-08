import { supabase } from "../lib/supabaseClient.js";

// phone / zip ride along as signup metadata; the handle_new_user() trigger
// copies them onto the new profile (customers can't update profiles directly).
export async function signUp(email, password, fullName, tenantSlug, { phone = "", zip = "" } = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, tenant_slug: tenantSlug, phone, zip } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
