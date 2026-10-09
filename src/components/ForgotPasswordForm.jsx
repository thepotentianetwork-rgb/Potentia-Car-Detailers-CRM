import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { requestPasswordReset } from "../api/auth.js";
import { setPasswordPath } from "../lib/authRedirect.js";
import { Field } from "./Field.jsx";

// Where reset emails send people: this site's /set-password page, keeping the
// business's branding when there is one.
export function resetRedirectUrl(business) {
  return `${window.location.origin}${setPasswordPath(business)}`;
}

// "Forgot password?" form. The confirmation is the same whether or not an
// account exists, so it can't be used to discover who has an account.
export function ForgotPasswordForm({ business, initialEmail = "", onBack, backLabel = "Back to sign in" }) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset(email.trim(), resetRedirectUrl(business));
      setSentTo(email.trim());
    } catch (e2) {
      setError(e2?.status === 429 ? "Too many requests. Please wait a minute and try again." : e2?.message || "Couldn't send the link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <div data-testid="reset-sent">
        <p className="text-sm text-[var(--brand-soft)] mb-1">Check your email</p>
        <p className="text-sm text-[var(--brand-muted)] mb-5">
          If there's an account for {sentTo}, we've sent it a link to set a new password. It may take a few minutes; check your spam folder too.
        </p>
        {onBack && (
          <button type="button" onClick={onBack} className="w-full text-center text-[13px] text-[var(--brand-muted)] hover:text-[var(--brand-soft)]">
            {backLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Field icon={<Mail size={15} />} placeholder="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {error && <p className="text-[13px] text-[#E08A8A]">{error}</p>}
      <button type="submit" disabled={loading} className="w-full mt-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
        {loading && <Loader2 size={14} className="animate-spin" />}
        Send reset link
      </button>
      {onBack && (
        <button type="button" onClick={onBack} className="w-full text-center text-[13px] text-[var(--brand-muted)] hover:text-[var(--brand-soft)] pt-2">
          {backLabel}
        </button>
      )}
    </form>
  );
}
