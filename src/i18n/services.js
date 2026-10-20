// Service names/descriptions/labels in the chosen language. Spanish comes
// from services.name_es / description_es (spanish-migration.sql), then the
// tenant file (serviceDetails[name].includesEs / durationLabelEs); anything
// missing falls back to English.
import { serviceIncludes } from "../lib/addons.js";
import { priceLabel, durationLabel } from "../tenants/branding.js";
import { formatDuration } from "./format.js";
import { translate } from "./index.jsx";

const filled = (s) => (typeof s === "string" && s.trim() ? s.trim() : "");

export function serviceName(service, lang) {
  return (lang === "es" && filled(service?.name_es)) || service?.name || "";
}

export function serviceIncludesFor(service, branding, lang) {
  if (lang === "es") {
    const es = filled(service?.description_es);
    if (es) return es.split("\n").map((l) => l.trim()).filter(Boolean);
    // Owner wrote an English description and no Spanish: show his words.
    if (filled(service?.description)) return serviceIncludes(service, branding);
    const fromFile = branding?.serviceDetails?.[service?.name]?.includesEs;
    if (fromFile?.length) return fromFile;
  }
  return serviceIncludes(service, branding);
}

export function priceLabelFor(service, branding, lang) {
  const en = priceLabel(service, branding);
  if (lang !== "es" || !en.startsWith("From ")) return en;
  return translate("es", "book.from", { price: en.slice(5) });
}

export function durationLabelFor(service, branding, lang) {
  if (lang !== "es") return durationLabel(service, branding);
  const d = branding?.serviceDetails?.[service?.name];
  if (d?.durationLabelEs) return d.durationLabelEs;
  if (d?.durationLabel) return d.durationLabel.replace(/\bhrs?\b/g, "h");
  return formatDuration(service.duration_min, "es");
}

// Tenant-file copy (tagline, price note, contact lines) in Spanish when the
// tenant provides it under `es`.
export function localBranding(branding, lang) {
  if (lang !== "es" || !branding?.es) return branding;
  const es = branding.es;
  return { ...branding, ...es, contact: branding.contact && { ...branding.contact, ...es.contact } };
}
