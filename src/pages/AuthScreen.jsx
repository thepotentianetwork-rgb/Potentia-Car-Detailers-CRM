import { useState } from "react";
import { User, Phone, MapPin, Loader2 } from "lucide-react";
import { signIn, signUp } from "../api/auth.js";
import { normalizePhone, isValidZip } from "../lib/contact.js";
import { Field } from "../components/Field.jsx";
import { ForgotPasswordForm } from "../components/ForgotPasswordForm.jsx";
import { useLang } from "../i18n/index.jsx";

// mode: "login" | "signup" | "choose" | "forgot". "choose" is the customer portal's
// "how do you want to book?" screen; it needs onGuest.
export function AuthScreen({ mode, setMode, onAuthed, onBack, setGlobalError, tenantSlug, allowSignup = true, onGuest }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const isLogin = mode === "login";
  // English unless rendered inside a shop portal with the language toggle.
  const { t, tm } = useLang();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setGlobalError("");
    if (!isLogin) {
      if (!normalizePhone(phone)) { setError("Enter a 10-digit mobile phone number."); return; }
      if (zip.trim() && !isValidZip(zip)) { setError("Enter a 5-digit ZIP code or leave it blank."); return; }
    }
    setLoading(true);
    try {
      if (isLogin) {
        const { session } = await signIn(email, password);
        await onAuthed(session);
      } else {
        const { session } = await signUp(email, password, fullName, tenantSlug, { phone: normalizePhone(phone), zip: zip.trim() });
        if (session) {
          await onAuthed(session);
        } else {
          setNeedsConfirm(true);
        }
      }
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  };

  if (needsConfirm) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-xl font-bold mb-2">{t("auth.checkEmail")}</h1>
        <p className="text-sm text-[var(--brand-muted)] max-w-xs mb-6">{t("auth.checkEmailBody", { email })}</p>
        <button
          onClick={() => { setNeedsConfirm(false); setMode("login"); }}
          className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm px-6 py-2.5 rounded-lg"
        >
          {t("auth.goSignIn")}
        </button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-xl p-6">
            <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-xl font-bold mb-1">{t("auth.resetTitle")}</h1>
            <p className="text-sm text-[var(--brand-muted)] mb-6">{t("auth.resetBody")}</p>
            <ForgotPasswordForm business={tenantSlug} initialEmail={email} onBack={() => setMode("login")} />
          </div>
        </div>
      </div>
    );
  }

  if (mode === "choose") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-xl p-6">
            <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-xl font-bold mb-1">{t("auth.chooseTitle")}</h1>
            <p className="text-sm text-[var(--brand-muted)] mb-6">{t("auth.chooseBody")}</p>
            <div className="space-y-2.5">
              {onGuest && (
                <button onClick={onGuest} className="w-full bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm py-2.5 rounded-lg transition-colors">
                  {t("auth.continueGuest")}
                </button>
              )}
              <button onClick={() => setMode("signup")} className="w-full border border-[var(--brand-border-strong)] hover:border-[var(--brand-border-hover)] text-[var(--brand-text)] font-semibold text-sm py-2.5 rounded-lg transition-colors">
                {t("auth.createAccount")}
              </button>
            </div>
            <button onClick={() => setMode("login")} className="w-full text-center text-[13px] text-[var(--brand-muted)] hover:text-[var(--brand-soft)] mt-5">
              {t("auth.haveAccount")}
            </button>
          </div>
          <button onClick={onBack} className="w-full text-center text-[13px] text-[var(--brand-subtle)] hover:text-[var(--brand-muted)] mt-4">{t("common.backHome")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-xl p-6">
          <h1 style={{ fontFamily: "var(--brand-font-heading)" }} className="text-xl font-bold mb-1">{isLogin ? t("auth.signIn") : t("auth.createYourAccount")}</h1>
          <p className="text-sm text-[var(--brand-muted)] mb-6">{isLogin ? t("auth.signInBody") : t("auth.signUpBody")}</p>
          <form onSubmit={submit} className="space-y-3.5">
            {!isLogin && <Field icon={<User size={15} />} placeholder={t("auth.fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} required />}
            <Field icon={<User size={15} />} placeholder={t("auth.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {!isLogin && (
              <>
                <Field icon={<Phone size={15} />} placeholder={t("auth.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <Field icon={<MapPin size={15} />} placeholder={t("auth.zip")} inputMode="numeric" maxLength={5} autoComplete="postal-code" value={zip} onChange={(e) => setZip(e.target.value)} />
              </>
            )}
            <Field icon={<User size={15} />} placeholder={t("auth.password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {isLogin && (
              <div className="flex justify-end -mt-1">
                <button type="button" onClick={() => { setError(""); setMode("forgot"); }} className="text-[12px] text-[var(--brand-muted)] hover:text-[var(--brand-soft)]">
                  {t("auth.forgot")}
                </button>
              </div>
            )}
            {error && <p className="text-[13px] text-[#E08A8A]">{tm(error)}</p>}
            <button type="submit" disabled={loading} className="w-full mt-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-on-primary)] font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isLogin ? t("auth.signIn") : t("auth.createAccountBtn")}
            </button>
          </form>
          {allowSignup && (
            <button onClick={() => setMode(isLogin ? "signup" : "login")} className="w-full text-center text-[13px] text-[var(--brand-muted)] hover:text-[var(--brand-soft)] mt-5">
              {isLogin ? t("auth.newHere") : t("auth.haveAccount")}
            </button>
          )}
          {onGuest && (
            <button onClick={onGuest} className="w-full text-center text-[13px] text-[var(--brand-muted)] hover:text-[var(--brand-soft)] mt-3">
              {t("auth.orGuest")}
            </button>
          )}
        </div>
        <button onClick={onBack} className="w-full text-center text-[13px] text-[var(--brand-subtle)] hover:text-[var(--brand-muted)] mt-4">{t("common.backHome")}</button>
      </div>
    </div>
  );
}
