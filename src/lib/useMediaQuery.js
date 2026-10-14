import { useEffect, useState } from "react";

// true while the viewport matches `query`. Without matchMedia (tests, very old
// browsers) it is false, so the phone layout is the fallback.
export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener ? mql.addEventListener("change", onChange) : mql.addListener(onChange);
    return () => (mql.removeEventListener ? mql.removeEventListener("change", onChange) : mql.removeListener(onChange));
  }, [query]);
  return matches;
}

// Tailwind's lg breakpoint.
export const DESKTOP_QUERY = "(min-width: 1024px)";
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
