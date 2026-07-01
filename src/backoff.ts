import type { Temporal } from "temporal-polyfill";
import { Seq } from "./seq.js";
import { getTemporal } from "./temporal.js";

/**
 * Retry/backoff delay sequences. Like `range`/`recur`, this is a params → lazy
 * `Seq` generator — here of `Temporal.Duration` delays — pairing naturally with
 * a scheduler/retry loop.
 */

export interface BackoffOptions {
  /** Initial delay: milliseconds (number) or a time-based duration-like. */
  base: number | Temporal.DurationLike;
  /** Growth multiplier per attempt (default 2 = exponential). Use 1 for constant. */
  factor?: number;
  /** Upper bound per delay (ms or duration-like). */
  max?: number | Temporal.DurationLike;
  /** Jitter strategy: `none` (default), `full` (0..d), or `equal` (d/2..d). */
  jitter?: "none" | "full" | "equal";
  /** Number of delays to yield; omit for an infinite sequence. */
  attempts?: number;
  /** RNG for jitter (default `Math.random`); inject for deterministic tests. */
  random?: () => number;
}

function toMs(v: number | Temporal.DurationLike): number {
  if (typeof v === "number") return v;
  const d = v as Record<string, number | undefined>;
  return (
    (d.days ?? 0) * 86_400_000 +
    (d.hours ?? 0) * 3_600_000 +
    (d.minutes ?? 0) * 60_000 +
    (d.seconds ?? 0) * 1000 +
    (d.milliseconds ?? 0)
  );
}

function applyJitter(ms: number, jitter: "none" | "full" | "equal", random: () => number): number {
  if (jitter === "full") return random() * ms;
  if (jitter === "equal") return ms / 2 + random() * (ms / 2);
  return ms;
}

/**
 * A lazy sequence of backoff delays as `Temporal.Duration`.
 *
 * ```ts
 * backoff({ base: 100, max: 5000, jitter: "equal", attempts: 6 }).toArray();
 * ```
 */
export function backoff(options: BackoffOptions): Seq<Temporal.Duration> {
  const { base, factor = 2, max, jitter = "none", attempts, random = Math.random } = options;
  const baseMs = toMs(base);
  const maxMs = max != null ? toMs(max) : Infinity;
  if (baseMs < 0) throw new RangeError("temporals: backoff() base must be non-negative");

  return new Seq<Temporal.Duration>(function* () {
    const Duration = getTemporal().Duration;
    for (let n = 0; attempts == null || n < attempts; n++) {
      const grown = Math.min(baseMs * Math.pow(factor, n), maxMs);
      const ms = applyJitter(grown, jitter, random);
      yield Duration.from({ milliseconds: Math.round(ms) });
    }
  });
}
