import type { DurationLike, Overflow, TemporalPoint } from "./types.js";
import { add, cmp, scaleDuration } from "./internal.js";
import { Seq } from "./seq.js";

/** Options for {@link range}. */
export interface RangeOptions<T extends TemporalPoint> {
  /** First point of the sequence (always included). */
  start: T;
  /** Bound. With a positive step it is an upper bound; with a negative step, lower. */
  end?: T;
  /** Maximum number of points to yield. */
  count?: number;
  /** The increment between points. Negative durations produce a descending range. */
  step: DurationLike;
  /** Include `end` when a point lands exactly on it. Default `false` (half-open). */
  inclusive?: boolean;
  /** Overflow behaviour for calendar arithmetic (e.g. month-end). Default `"constrain"`. */
  overflow?: Overflow;
}

/**
 * A lazy sequence of Temporal points from `start`, advancing by `step`.
 *
 * Bounded by `end` (half-open `[start, end)` unless `inclusive`), by `count`,
 * or both. With neither, the sequence is infinite — bound it with `.take(n)`
 * before materialising.
 *
 * The direction is inferred from the sign of `step`. Stepping in calendar units
 * (`{ days: 1 }`, `{ months: 1 }`) keeps DST and month-length handling correct;
 * avoid `{ hours: 24 }` for day steps across time zones.
 */
export function range<T extends TemporalPoint>(options: RangeOptions<T>): Seq<T> {
  const { start, end, count, step, inclusive = false, overflow } = options;

  if (count !== undefined && (count < 0 || !Number.isInteger(count))) {
    throw new RangeError("temporals: range() count must be a non-negative integer");
  }

  return new Seq<T>(function* () {
    if (count === 0) return;

    // Anchor-relative stepping (start + step×n) rather than repeated `+ step`,
    // so calendar constraints don't compound (Jan 31 monthly → Feb 28 → Mar 31).
    const probe = add(start, step, overflow);
    const dir = cmp(probe, start);

    if (dir === 0 && count === undefined) {
      throw new RangeError(
        "temporals: range() step is zero with no count bound (would be infinite)",
      );
    }

    const withinEnd = (cur: T): boolean => {
      if (end === undefined) return true;
      const c = cmp(cur, end);
      if (dir > 0) return inclusive ? c <= 0 : c < 0;
      if (dir < 0) return inclusive ? c >= 0 : c > 0;
      return true; // zero step: bounded solely by count
    };

    let n = 0;
    while (true) {
      const cur = n === 0 ? start : add(start, scaleDuration(step, n), overflow);
      if (!withinEnd(cur)) return;
      yield cur;
      n++;
      if (count !== undefined && n >= count) return;
    }
  });
}
