import type { Temporal as TemporalNS } from "temporal-polyfill";

/**
 * Resolve a Temporal implementation for the rare operations that must
 * *construct* values from scratch (parsing strings, `now()` helpers). The
 * sequence engines never call this — they derive everything from the input
 * values — so a missing global only affects those explicit helpers.
 *
 * Resolution order: an explicitly configured implementation, then
 * `globalThis.Temporal` (native on Node 22+ / modern browsers, or installed via
 * `import "temporal-polyfill/global"`).
 */
type TemporalImpl = typeof TemporalNS;

let configured: TemporalImpl | undefined;

/** Inject a Temporal implementation (e.g. the named polyfill export). */
export function configureTemporal(impl: TemporalImpl): void {
  configured = impl;
}

/** Resolve the active Temporal implementation (configured, else `globalThis.Temporal`). */
export function getTemporal(): TemporalImpl {
  const impl =
    configured ??
    (globalThis as unknown as { Temporal?: TemporalImpl }).Temporal;
  if (!impl) {
    throw new ReferenceError(
      'temporals: no Temporal implementation found. Use a runtime with native Temporal (Node 22+), import "temporal-polyfill/global", or call configureTemporal(Temporal).',
    );
  }
  return impl;
}
