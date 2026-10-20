import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STRINGS, MESSAGES_ES, MESSAGE_PATTERNS_ES, UNKNOWN_ERROR_ES } from "./strings.js";

// Lightweight English/Español switch for a shop's customer pages. Only shops
// whose branding sets `languageToggle: true` get it; everyone else (and
// anything rendered outside a LanguageProvider, like the owner dashboard)
// is English.
export const LANGS = ["en", "es"];
export const storageKey = (slug) => `potentia.lang.${slug}`;

// Stored choice first, then the browser's first preferred language (es-*
// starts in Spanish), else English.
export function initialLang(slug, enabled, storage, browserLangs) {
  if (!enabled) return "en";
  let saved = null;
  try { saved = storage?.getItem(storageKey(slug)); } catch { /* storage blocked */ }
  if (LANGS.includes(saved)) return saved;
  const first = (browserLangs || [])[0] || "";
  return /^es\b/i.test(first) ? "es" : "en";
}

function fill(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : text;
}

export function translate(lang, key, vars) {
  const text = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return fill(text, vars);
}

// A message shown to the customer (form check or server error). Known ones
// are translated; an unknown server message gets a Spanish lead-in with the
// original after it, so nothing is hidden.
export function translateMessage(msg, lang) {
  if (!msg || lang !== "es") return msg;
  const text = String(msg).trim();
  if (MESSAGES_ES[text]) return MESSAGES_ES[text];
  for (const [re, fn] of MESSAGE_PATTERNS_ES) {
    const m = text.match(re);
    if (m) return fn(m);
  }
  return `${UNKNOWN_ERROR_ES} (${text})`;
}

const english = {
  lang: "en",
  enabled: false,
  setLang: () => {},
  t: (key, vars) => translate("en", key, vars),
  tm: (msg) => msg,
};
const LanguageContext = createContext(english);

export function LanguageProvider({ slug, enabled, children }) {
  const [lang, setLangState] = useState(() =>
    initialLang(slug, enabled, typeof localStorage !== "undefined" ? localStorage : null,
      typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : [])
  );
  const effective = enabled ? lang : "en";
  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    setLangState(next);
    try { localStorage.setItem(storageKey(slug), next); } catch { /* storage blocked */ }
  }, [slug]);

  useEffect(() => {
    if (!enabled) return undefined;
    const prev = document.documentElement.lang;
    document.documentElement.lang = effective;
    return () => { document.documentElement.lang = prev || "en"; };
  }, [enabled, effective]);

  const value = useMemo(() => ({
    lang: effective,
    enabled: !!enabled,
    setLang,
    t: (key, vars) => translate(effective, key, vars),
    tm: (msg) => translateMessage(msg, effective),
  }), [effective, enabled, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLang = () => useContext(LanguageContext);
