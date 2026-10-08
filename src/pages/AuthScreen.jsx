import { useState } from "react";
import { User, Phone, MapPin, Loader2 } from "lucide-react";
import { signIn, signUp } from "../api/auth.js";
import { normalizePhone, isValidZip } from "../lib/contact.js";
import { Field } from "../components/Field.jsx";

// mode: "login" | "signup" | "choose". "choose" is the customer portal's
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
        <h1 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-xl font-bold mb-2">Check your email</h1>
        <p className="text-sm text-[#8B8F96] max-w-xs mb-6">We sent a confirmation link to {email}. Confirm it, then sign in.</p>
        <button
          onClick={() => { setNeedsConfirm(false); setMode("login"); }}
          className="bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm px-6 py-2.5 rounded-lg"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  if (mode === "choose") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-[#111214] border border-[#232529] rounded-xl p-6">
            <h1 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-xl font-bold mb-1">Book a service</h1>
            <p className="text-sm text-[#8B8F96] mb-6">Book as a guest, or create an account to keep your vehicle and history in one place.</p>
            <div className="space-y-2.5">
              {onGuest && (
                <button onClick={onGuest} className="w-full bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm py-2.5 rounded-lg transition-colors">
                  Continue as guest
                </button>
              )}
              <button onClick={() => setMode("signup")} className="w-full border border-[#2A2C30] hover:border-[#4A4D53] text-[#F5F5F6] font-semibold text-sm py-2.5 rounded-lg transition-colors">
                Create an account
              </button>
            </div>
            <button onClick={() => setMode("login")} className="w-full text-center text-[13px] text-[#8B8F96] hover:text-[#C9CDD3] mt-5">
              Already have an account? Sign in
            </button>
          </div>
          <button onClick={onBack} className="w-full text-center text-[13px] text-[#5C5F66] hover:text-[#8B8F96] mt-4">Back to homepage</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="bg-[#111214] border border-[#232529] rounded-xl p-6">
          <h1 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-xl font-bold mb-1">{isLogin ? "Sign in" : "Create your account"}</h1>
          <p className="text-sm text-[#8B8F96] mb-6">{isLogin ? "Book services and track your detail history." : "Save your vehicle info and see every detail we've done."}</p>
          <form onSubmit={submit} className="space-y-3.5">
            {!isLogin && <Field icon={<User size={15} />} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />}
            <Field icon={<User size={15} />} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {!isLogin && (
              <>
                <Field icon={<Phone size={15} />} placeholder="Mobile phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <Field icon={<MapPin size={15} />} placeholder="ZIP code (optional)" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={zip} onChange={(e) => setZip(e.target.value)} />
              </>
            )}
            <Field icon={<User size={15} />} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {error && <p className="text-[13px] text-[#E08A8A]">{error}</p>}
            <button type="submit" disabled={loading} className="w-full mt-2 bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isLogin ? "Sign in" : "Create account"}
            </button>
          </form>
          {allowSignup && (
            <button onClick={() => setMode(isLogin ? "signup" : "login")} className="w-full text-center text-[13px] text-[#8B8F96] hover:text-[#C9CDD3] mt-5">
              {isLogin ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          )}
          {onGuest && (
            <button onClick={onGuest} className="w-full text-center text-[13px] text-[#8B8F96] hover:text-[#C9CDD3] mt-3">
              Or continue as guest
            </button>
          )}
        </div>
        <button onClick={onBack} className="w-full text-center text-[13px] text-[#5C5F66] hover:text-[#8B8F96] mt-4">Back to homepage</button>
      </div>
    </div>
  );
}
