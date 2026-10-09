import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TENANT_PREVIEWS, previewFile, withPreview } from "./src/tenants/linkPreviews.js";

// After the build, write dist/previews/<slug>.html: the built index.html with
// that business's link-preview tags (see src/tenants/linkPreviews.js).
function businessLinkPreviews() {
  return {
    name: "business-link-previews",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir || "dist";
      const html = readFileSync(join(dir, "index.html"), "utf8");
      for (const [slug, preview] of Object.entries(TENANT_PREVIEWS)) {
        const out = join(dir, previewFile(slug));
        mkdirSync(join(out, ".."), { recursive: true });
        writeFileSync(out, withPreview(html, preview));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), businessLinkPreviews()],
});
