// Supabase invite and password-recovery links land on the app with the
// session in the URL hash (#access_token=…&type=invite|recovery), or with an
// error (#error_code=otp_expired&error_description=…). supabase-js reads and
// clears that hash on startup, so it is captured here first. This module is
// imported by supabaseClient.js before the client is created.
//
// Invites and reset emails should redirect to /set-password (optionally
// ?business=<slug> for that business's branding). If Supabase falls back to
// the Site URL instead, AuthLinkGuard (App.jsx) still sends the visitor to
// /set-password before any other page can route them away.

export const SET_PASSWORD_PATH = "/set-password";
const LINK_TYPES = ["invite", "recovery"];

export function readAuthLink(loc) {
  const none = { type: null, error: null };
  if (!loc) return none;
  const hash = new URLSearchParams(String(loc.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(String(loc.search || ""));
  const get = (k) => hash.get(k) ?? query.get(k);
  const errorCode = get("error_code") || (get("error") && get("error_description") ? get("error") : null);
  if (errorCode) {
    return { type: null, error: get("error_description") || errorCode };
  }
  const type = hash.get("type");
  if (LINK_TYPES.includes(type) && hash.get("access_token")) return { type, error: null };
  return none;
}

let pending = readAuthLink(typeof window !== "undefined" ? window.location : null);

export function getPendingAuthLink() {
  return pending;
}

export function clearPendingAuthLink() {
  pending = { type: null, error: null };
}

// "/set-password" or "/set-password?business=<slug>"
export function setPasswordPath(business) {
  return business ? `${SET_PASSWORD_PATH}?business=${encodeURIComponent(business)}` : SET_PASSWORD_PATH;
}

// Business slug from a /crm/<slug>/… path (not the Potentia admin).
export function businessFromPath(pathname) {
  const m = /^\/crm\/([^/]+)/.exec(pathname || "");
  return m && m[1] !== "admin" ? decodeURIComponent(m[1]) : null;
}
