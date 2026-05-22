/// <reference types="vitest/config" />
import { defineConfig } from "vite";
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
  },
});