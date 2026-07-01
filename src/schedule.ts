import type { Temporal } from "temporal-polyfill";
import type { TemporalPoint } from "./types.js";
import { cmp } from "./internal.js";
import { Seq } from "./seq.js";
import { range, type RangeOptions } from "./range.js";
import { recur, type RecurRule } from "./recur.js";

/**
 * A `Schedule` is the unifying answer to "**when does this happen?**". Cron
 * expressions, RRULE rules, and plain ranges all compile to the same thing: a
 * lazy, ascending stream of occurrences you can query relative to a point.
 *
 * It is pure — it computes *when*, never *does* anything. Pair it with a runner
 * (see the reference scheduler) to actually fire.
 */
export class Schedule<T extends TemporalPoint = Temporal.ZonedDateTime> {
  /** @param occ Produces occurrences at/after `from`, ascending (inclusive of `from`). */
  constructor(private readonly occ: (from: T) => Seq<T>) {}

  /** Occurrences at or after `from`, ascending and lazy. */
  occurrences(from: T): Seq<T> {
    return this.occ(from);
  }

  /** The next occurrence strictly after `from`, or `undefined` if the schedule ends. */
  next(from: T): T | undefined {
    for (const t of this.occ(from)) if (cmp(t, from) > 0) return t;
    return undefined;
  }

  /** The next `n` occurrences strictly after `from`. */
  nextN(from: T, n: number): T[] {
    return this.occ(from)
      .filter((t) => cmp(t, from) > 0)
      .take(n)
      .toArray();
  }

  /** Occurrences within `[start, end)` (or `[start, end]` with `inclusiveEnd`). */
  between(start: T, end: T, opts?: { inclusiveEnd?: boolean }): T[] {
    const inclusive = opts?.inclusiveEnd ?? false;
    return this.occ(start)
      .takeWhile((t) => (inclusive ? cmp(t, end) <= 0 : cmp(t, end) < 0))
      .toArray();
  }

  /** Wrap a custom occurrences function. */
  static of<T extends TemporalPoint>(occ: (from: T) => Seq<T>): Schedule<T> {
    return new Schedule(occ);
  }

  /** A schedule from an RRULE-style recurrence rule. */
  static rule<T extends TemporalPoint>(rule: RecurRule<T>): Schedule<T> {
    const all = recur(rule);
    return new Schedule<T>((from) => all.dropWhile((t) => cmp(t, from) < 0));
  }

  /** A schedule from a stepped range. */
  static range<T extends TemporalPoint>(options: RangeOptions<T>): Schedule<T> {
    const all = range(options);
    return new Schedule<T>((from) => all.dropWhile((t) => cmp(t, from) < 0));
  }
}
