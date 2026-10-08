import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Run tests in UTC, like CI and Vercel, and unlike the business
// (America/Denver). Then a date bug that only shows up when the browser's zone
// differs from the shop's can't hide behind the developer's own clock.
process.env.TZ = "UTC";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
  },
});
