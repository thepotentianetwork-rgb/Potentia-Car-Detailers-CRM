import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_PREVIEW, TENANT_PREVIEWS, previewTags, withPreview, previewFile } from "../tenants/linkPreviews.js";
import juan from "../tenants/juans-auto-detailing.js";

const root = resolve(__dirname, "../..");
const indexHtml = readFileSync(resolve(root, "index.html"), "utf8");
const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
const tag = (html, attr, name) => new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(html)?.[1];

describe("static link-preview tags", () => {
  it("index.html is neutral Potentia (no Apex) and matches DEFAULT_PREVIEW", () => {
    expect(indexHtml).not.toMatch(/apex/i);
    expect(indexHtml).toContain(previewTags(DEFAULT_PREVIEW));
    expect(indexHtml).toContain("<title>Potentia Portal</title>");
    expect(tag(indexHtml, "property", "og:title")).toBe("Potentia Portal");
    expect(tag(indexHtml, "property", "og:description")).toBe("Book appointments and manage your account.");
    expect(tag(indexHtml, "property", "og:image")).toBe("https://portal.potentianetwork.com/og-potentia.png");
    expect(indexHtml).toContain('<script type="module" src="/src/main.jsx"></script>');
  });

  it("per-business HTML swaps only the preview block and escapes text", () => {
    const html = withPreview(indexHtml, TENANT_PREVIEWS["juans-auto-detailing"]);
    expect(html).toContain("<title>Juan's Auto Detailing</title>");
    expect(tag(html, "property", "og:title")).toBe("Juan's Auto Detailing");
    expect(tag(html, "property", "og:image")).toBe("https://portal.potentianetwork.com/tenants/juans-auto-detailing/og.png");
    expect(html).not.toContain("Potentia Portal");
    expect(html.replace(/<!-- link-preview:start -->[\s\S]*<!-- link-preview:end -->/, "")).toBe(
      indexHtml.replace(/<!-- link-preview:start -->[\s\S]*<!-- link-preview:end -->/, "")
    );
    expect(previewTags({ title: 'A "B" <C> & D', description: "x", image: "/i.png" })).toContain(
      "<title>A &quot;B&quot; &lt;C&gt; &amp; D</title>"
    );
    expect(() => withPreview("<html></html>", DEFAULT_PREVIEW)).toThrow(/link-preview/);
  });

  it("every business with a preview has both rewrites, before the SPA catch-all", () => {
    const sources = vercel.rewrites.map((r) => r.source);
    const catchAll = sources.indexOf("/((?!api/).*)");
    expect(catchAll).toBe(vercel.rewrites.length - 1);
    for (const slug of Object.keys(TENANT_PREVIEWS)) {
      for (const source of [`/crm/${slug}`, `/crm/${slug}/:path*`]) {
        const r = vercel.rewrites.find((x) => x.source === source);
        expect(r, source).toBeTruthy();
        expect(r.destination).toBe(previewFile(slug));
      }
    }
    // No rewrite points at a preview file that isn't generated.
    for (const r of vercel.rewrites.filter((x) => x.destination.startsWith("/previews/"))) {
      expect(Object.keys(TENANT_PREVIEWS).map(previewFile)).toContain(r.destination);
    }
  });

  it("preview images exist and Juan's title matches his branding", () => {
    for (const p of [DEFAULT_PREVIEW, ...Object.values(TENANT_PREVIEWS)]) {
      expect(() => readFileSync(resolve(root, "public" + p.image))).not.toThrow();
    }
    expect(TENANT_PREVIEWS["juans-auto-detailing"].title).toBe(juan.logo.alt);
  });
});
