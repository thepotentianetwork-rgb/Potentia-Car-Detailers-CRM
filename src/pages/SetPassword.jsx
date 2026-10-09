import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { updatePassword } from "../api/auth.js";
import { homePathFor } from "../lib/homeRoute.js";
import { getTenantBranding, brandingStyle, useTenantDocument } from "../tenants/branding.js";
import { Field } from "../components/Field.jsx";
import { ForgotPasswordForm } from "../components/ForgotPasswordForm.jsx";
import { LoadingBox } from "../components/LoadingBox.jsx";

export const MIN_PASSWORD_LENGTH = 8;

// /set-password[?business=<slug>]
// Landing page for Supabase invite and password-reset links. With a valid
// link the visitor is signed in and chooses a password, then goes to their
// home (owners: business dashboard). Expired/used links, or visiting without
// a link, offer to email a fresh reset link instead.
export function SetPassword() {
  const [params] = useSearchParams();
  const business = params.get("business") || null;
  const branding = useMemo(() => getTenantBranding(business), [business]);
  const businessName = branding.logo.alt && branding.logo.alt !== "Potentia" ? branding.logo.alt : "Potentia";
  useTenantDocument(branding, `Set your password · ${businessName}`);

  const navigate = useNavigate();
  const { session, profile, checkingSession, authLink, clearAuthLink } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const isInvite = authLink?.type === "invite";

  // Leaving without setting a password: forget the link so AuthLinkGuard
  // doesn't bounce the visitor back here.
  const leave = () => {
    clearAuthLink();
    navigate("/login");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSaving(true);
    try {
      await updatePassword(password);
    } catch (e2) {
      setError(e2?.message || "Couldn't save your password. Please try again.");
      setSaving(false);
      return;
    }
    setDone(true);
    clearAuthLink();
    let path = "/login";
    try {
      if (profile) path = await homePathFor(profile);
    } catch {
      path = "/login";
    }
    navigate(path, { replace: true });
  };

  let body;
  if (checkingSession || done) {
    body = <LoadingBox center />;
  } else if (authLink?.error || !session) {
    body = (
      <>
        <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-xl font-bold mb-1">
          {authLink?.error ? "This link has expired" : "Set your password"}
        </h1>
        <p className="text-sm text-[var(--brand-muted)] mb-6">
          {authLink?.error
            ? "Password links only work once and expire after a while. Enter your email and we'll send you a new one."
            : "Open the link in your email to set a password, or request a new link below."}
        </p>
        <ForgotPasswordForm business={business} onBack={leave} />
      </>
    );
  } else {
    body = (
      <>
        <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-xl font-bold mb-1">
          {isInvite ? "Welcome! Set your password" : "Choose a new password"}
        </h1>
        <p className="text-sm text-[var(--brand-muted)] mb-6">
          {session.user?.email ? <>For <span className="text-[var(--brand-soft)]">{session.user.email}</span>. </> : null}
          You'll use it to sign in from now on.
        </p>
        <form onSubmit={submit} className="space-y-3.5">
          <Field icon={<Lock size={15} />} placeholder="New password" type="password" autoComplete="new-password" aria-label="New password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Field icon={<Lock size={15} />} placeholder="Confirm password" type="password" autoComplete="new-password" aria-label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          <p className="text-[12px] text-[var(--brand-subtle)]">At least {MIN_PASSWORD_LENGTH} characters.</p>
          {error && <p className="text-[13px] text-[#E08A8A]">{error}</p>}
          <button type="submit" disabled={saving} className="w-full mt-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save password and continue
          </button>
        </form>
      </>
    );
  }

  return (
    <div style={{ ...brandingStyle(branding), fontFamily: "var(--brand-font-body)" }} className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] flex flex-col">
      <header className="flex flex-col items-center pt-12 pb-2 px-6 text-center">
        {branding.logo.wide ? (
          <img src={branding.logo.src} alt={branding.logo.alt} className="h-12 w-auto object-contain" />
        ) : (
          <>
            <img src={branding.logo.src} alt={branding.logo.alt} className="w-14 h-14 object-contain mb-3" />
            <div style={{ fontFamily: "var(--brand-font-heading)" }} className="text-lg font-extrabold uppercase tracking-wide">{businessName}</div>
          </>
        )}
      </header>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-xl p-6">{body}</div>
          <Link to="/login" onClick={clearAuthLink} className="block w-full text-center text-[13px] text-[var(--brand-subtle)] hover:text-[var(--brand-muted)] mt-4">
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
