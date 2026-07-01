import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cron: "src/cron-entry.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // Share core code (Seq, Schedule, internal) between the index and cron
  // bundles rather than duplicating it (ESM chunk splitting).
  splitting: true,
  // Temporal is resolved at runtime from globalThis or an optional peer dep;
  // never bundle a copy of the polyfill into the library output.
  external: ["temporal-polyfill"],
});
