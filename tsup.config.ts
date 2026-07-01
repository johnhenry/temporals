import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // Temporal is resolved at runtime from globalThis or an optional peer dep;
  // never bundle a copy of the polyfill into the library output.
  external: ["temporal-polyfill"],
});
