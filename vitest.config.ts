import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/*" path alias (tsconfig) so tests can import internal modules.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
