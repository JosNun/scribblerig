import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin wires up the Workers dev/build pipeline, but its dev
// server hook throws under Vitest (no Worker config to read). It's irrelevant to
// the unit tests, so leave it out when Vitest is driving the config.
export default defineConfig({
  plugins: [react(), ...(process.env.VITEST ? [] : [cloudflare()])],
  test: {
    globals: true,
    environment: "node",
    // Agent isolation worktrees live under `.claude/worktrees/`. They contain
    // full copies of `src/`, including test files, which would otherwise
    // double-count every test the orchestrating session inherits from the
    // base branch. Vitest's default `exclude` doesn't cover this path, so
    // splice it in explicitly.
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
  },
});