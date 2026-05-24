import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin wires up the Workers dev/build pipeline, but its dev
// server hook throws under Vitest (no Worker config to read). It's irrelevant to
// the unit tests, so leave it out when Vitest is driving the config.
export default defineConfig({
  plugins: [react(), ...(process.env.VITEST ? [] : [cloudflare()])],
  build: {
    // Rapier's `-compat` variant inlines its WASM as base64, weighing ~1.5 MB
    // on its own. It's dynamic-imported from `sim.ts` so the initial chunk
    // stays small (~120 KB gzip), but the rapier chunk itself unavoidably
    // exceeds Vite's default 500 KB warning. Lift the limit past Rapier's
    // size so the warning only fires for *new* growth — not the known floor.
    chunkSizeWarningLimit: 1600,
  },
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