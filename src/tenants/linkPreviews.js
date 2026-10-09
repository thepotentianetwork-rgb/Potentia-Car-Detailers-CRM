// Static <head> tags for link previews (iMessage, Slack, Facebook…). Preview
// bots read the HTML as served and never run our JS, so these are baked in at
// build time:
//   - index.html carries DEFAULT_PREVIEW (neutral Potentia).
//   - The build (vite.config.js) also writes dist/previews/<slug>.html for each
//     business below, and vercel.json rewrites /crm/<slug> and /crm/<slug>/*
//     to that file. It's the same app; only the <head> tags differ.
// Adding a business: add an entry here AND its two rewrites in vercel.json
// (a test checks they match). The runtime tab title is still set per
// business by useTenantDocument.
// Plain data only (no React imports): vite.config.js loads this in Node.

export const SITE_ORIGIN = "https://portal.potentianetwork.com";

export const DEFAULT_PREVIEW = {
  title: "Potentia Portal",
  description: "Book appointments and manage your account.",
  image: "/og-potentia.png",
};

export const TENANT_PREVIEWS = {
  "apex-detailing": {
    title: "Apex Auto Detailing",
    description: "Book your detail with Apex Auto Detailing.",
    image: DEFAULT_PREVIEW.image,
  },
  "juans-auto-detailing": {
    title: "Juan's Auto Detailing",
    description: "Book your detail with Juan's Auto Detailing in Tremonton, UT.",
    image: "/tenants/juans-auto-detailing/og.png",
  },
  "route-six-auto": {
    title: "Route Six Auto",
    description: "Book appointments and manage your account with Route Six Auto.",
    image: DEFAULT_PREVIEW.image,
  },
};

export const PREVIEW_START = "<!-- link-preview:start -->";
export const PREVIEW_END = "<!-- link-preview:end -->";

export function previewFile(slug) {
  return `/previews/${slug}.html`;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function previewTags({ title, description, image }) {
  const img = /^https?:\/\//.test(image) ? image : SITE_ORIGIN + image;
  return [
    PREVIEW_START,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(title)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    PREVIEW_END,
  ].join("\n");
}

// Replaces the marked block in an HTML document; throws if it's missing so a
// broken index.html fails the build instead of shipping wrong previews.
export function withPreview(html, preview) {
  const start = html.indexOf(PREVIEW_START);
  const end = html.indexOf(PREVIEW_END);
  if (start < 0 || end < start) throw new Error("index.html is missing the link-preview block");
  return html.slice(0, start) + previewTags(preview) + html.slice(end + PREVIEW_END.length);
}
