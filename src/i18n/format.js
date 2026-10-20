// Dates, times and durations in the visitor's chosen language. Spanish uses
// Latin American conventions: "2:00 p. m.", "Mar, 20 de oct", "1 h 30 min".
import { minutesToDisplay } from "../lib/time.js";
import { minutesText } from "../lib/addons.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatTime(mins, lang = "en") {
  if (lang !== "es") return minutesToDisplay(mins);
  const h24 = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, "0");
  return `${h24 % 12 || 12}:${m} ${h24 >= 12 ? "p. m." : "a. m."}`;
}

// d: a local-noon Date holding the business's calendar date (see lib/time.js).
export function formatDay(d, lang = "en") {
  if (lang !== "es") return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const days = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  // Written out (not Intl) so it reads the same in every browser.
  return cap(`${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]}`);
}

export function formatDuration(m, lang = "en") {
  if (lang !== "es") return minutesText(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// "a las 2:00 p. m." but "a la 1:00 p. m."
export const atTimeEs = (time) => (/^1:/.test(time) ? `a la ${time}` : `a las ${time}`);
