// Per-tenant look and contact details for the customer-facing portal
// (/crm/:tenantSlug/portal).
//
// Business data (name, tagline, hours, slot grid, payment methods, services
// and prices) lives in the database: the `tenants` and `services` rows. See
// tenants/<slug>-seed.sql at the repo root. The tenants table has no columns
// for logo, colors, fonts or contact info, so those live here, keyed by the
// tenant's slug. A slug without an entry gets the default Potentia look, so
// existing tenants are unchanged.
//
// To brand a new tenant: add src/tenants/<slug>.js exporting a partial
// branding object, put its assets in public/tenants/<slug>/, and register it
// in TENANT_BRANDING below.
import { useEffect } from "react";
import { useTenant } from "../context/TenantContext.jsx";
import juansAutoDetailing from "./juans-auto-detailing.js";

export const DEFAULT_BRANDING = {
  logo: { src: "/potentia-logo.png", alt: "Potentia", wide: false },
  hero: { video: "/potentia-hero-bg.mp4", poster: null },
  // Google Fonts stylesheet for this tenant (null = the fonts index.css loads).
  fontsHref: null,
  fonts: { heading: "Montserrat, sans-serif", body: "Inter, sans-serif" },
  headingUppercase: false,
  // Must match the :root defaults in src/index.css.
  colors: {
    bg: "#0A0A0B",
    surface: "#111214",
    input: "#0D0E10",
    border: "#232529",
    divider: "#1D1E21",
    borderStrong: "#2A2C30",
    borderHover: "#4A4D53",
    text: "#F5F5F6",
    muted: "#8B8F96",
    subtle: "#5C5F66",
    soft: "#C9CDD3",
    primary: "#E4E7EB",
    primaryHover: "#FFFFFF",
    onPrimary: "#0A0A0B",
  },
  // Shown on the portal homepage when set:
  // { phone, email, address, hours, serviceArea, cities: [], payment }
  contact: null,
  // Days the portal never offers (0 = Sunday ... 6 = Saturday). Customer
  // portal only; request_booking() does not check weekdays (yet).
  closedWeekdays: [],
  zipPlaceholder: "80202",
  // Note shown under the services list on the homepage.
  priceNote: null,
  // Extra copy per service, keyed by the exact services.name:
  // { from: true (price is a starting price), durationLabel, includes: [] }
  serviceDetails: {},
};

export const TENANT_BRANDING = {
  "juans-auto-detailing": juansAutoDetailing,
};

const cache = new Map();

// Same object for the same slug, so it's safe in hook dependency lists.
export function getTenantBranding(slug) {
  const custom = TENANT_BRANDING[slug];
  if (!custom) return DEFAULT_BRANDING;
  if (!cache.has(slug)) cache.set(slug, mergeBranding(custom));
  return cache.get(slug);
}

function mergeBranding(custom) {
  return {
    ...DEFAULT_BRANDING,
    ...custom,
    logo: { ...DEFAULT_BRANDING.logo, ...custom.logo },
    hero: { ...DEFAULT_BRANDING.hero, ...custom.hero },
    fonts: { ...DEFAULT_BRANDING.fonts, ...custom.fonts },
    colors: { ...DEFAULT_BRANDING.colors, ...custom.colors },
    serviceDetails: { ...DEFAULT_BRANDING.serviceDetails, ...custom.serviceDetails },
  };
}

// CSS custom properties for the portal root. Components use
// var(--brand-*) so the defaults in index.css apply everywhere else.
export function brandingStyle(branding) {
  const c = branding.colors;
  return {
    "--brand-bg": c.bg,
    "--brand-surface": c.surface,
    "--brand-input": c.input,
    "--brand-border": c.border,
    "--brand-divider": c.divider,
    "--brand-border-strong": c.borderStrong,
    "--brand-border-hover": c.borderHover,
    "--brand-text": c.text,
    "--brand-muted": c.muted,
    "--brand-subtle": c.subtle,
    "--brand-soft": c.soft,
    "--brand-primary": c.primary,
    "--brand-primary-hover": c.primaryHover,
    "--brand-on-primary": c.onPrimary,
    "--brand-font-heading": branding.fonts.heading,
    "--brand-font-body": branding.fonts.body,
    fontFamily: branding.fonts.body,
  };
}

export function headingStyle(branding) {
  return {
    fontFamily: "var(--brand-font-heading)",
    ...(branding.headingUppercase && { textTransform: "uppercase", letterSpacing: "0.02em" }),
  };
}

export function useBranding() {
  const { tenant } = useTenant();
  return getTenantBranding(tenant?.slug);
}

// Page title, tenant fonts, and the page background behind the portal (so
// overscroll doesn't flash the default color).
export function useTenantDocument(branding, businessName) {
  useEffect(() => {
    const prevTitle = document.title;
    if (businessName) document.title = businessName;
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = branding.colors.bg;
    let link;
    if (branding.fontsHref && !document.querySelector(`link[href="${branding.fontsHref}"]`)) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = branding.fontsHref;
      document.head.appendChild(link);
    }
    return () => {
      document.title = prevTitle;
      document.body.style.backgroundColor = prevBg;
      if (link) link.remove();
    };
  }, [branding, businessName]);
}

// "From $400" / "$165"
export function priceLabel(service, branding) {
  const dollars = `$${(service.price_cents / 100).toFixed(0)}`;
  return branding.serviceDetails[service.name]?.from ? `From ${dollars}` : dollars;
}

export function durationLabel(service, branding) {
  const custom = branding.serviceDetails[service.name]?.durationLabel;
  if (custom) return custom;
  const m = service.duration_min;
  return m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} hr` : `${m} min`;
}
