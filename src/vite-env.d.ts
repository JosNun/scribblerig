/// <reference types="vite/client" />

// Wrangler / Cloudflare Workers: a bare `import wasm from "./foo.wasm"`
// resolves to a `WebAssembly.Module` at bundle time. Declare so TypeScript
// is happy when the worker imports resvg's wasm payload.
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
