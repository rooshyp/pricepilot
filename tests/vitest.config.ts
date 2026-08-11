import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

/** Isolated unit-test config: avoids loading the app's Cloudflare development plugins. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("..", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
