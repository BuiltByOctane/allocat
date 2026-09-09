import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/*" path alias (tsconfig) so tests can import internal modules.
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Git worktrees live under .claude/worktrees/ and are full checkouts of
      // OTHER branches. Without this, `npm run test` silently runs their suites
      // too — a failure on an unrelated branch then looks like a failure here.
      "**/.claude/worktrees/**",
      // Built web assets copied into the native shell.
      "**/android/**",
      "**/.next/**",
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
