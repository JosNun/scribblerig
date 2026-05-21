# ADR-0005 — bun as package manager and runtime

Status: accepted
Date: 2026-05-21

## Context

The project was scaffolded with npm. The team wants a faster package manager. Options
considered: pnpm (Node-only, strict node_modules) and bun (package manager + runtime
+ test runner).

## Decision

Use **bun** as the package manager and JS runtime. Commit `bun.lock`; remove
`package-lock.json`.

- `bun install` for dependencies.
- Scripts run via `bun run` (`bun run dev`, `bun run build`, `bun run test`).
- **Keep Vitest as the test runner** for now (run as `bun run test`), rather than
  switching to `bun test`. Vitest is already wired and green, integrates with the
  Vite config, and `bun test` has a different API. Revisit only if there's a concrete
  reason.

Verified: `bun install`, the full Vitest suite, and the Vite production build all run
under bun, including Rapier's WASM (`@dimforge/rapier2d-compat`) in the Vitest/node
environment.

## Consequences

- `.claude/launch.json` runs the dev server via bun.
- Contributors need bun installed.
- bun's runtime/test-runner capabilities are available later if we want them, but the
  Vite + Vitest toolchain is unchanged for now.
