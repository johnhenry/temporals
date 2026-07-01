import type { DurationLike, TemporalPoint } from "./types.js";
import { add, cmp } from "./internal.js";
import { Interval } from "./interval.js";
import { Seq } from "./seq.js";

export interface ChunksOptions<T extends TemporalPoint> {
  start: T;
  end: T;
  /** Width of each chunk. */
  by: DurationLike;
  /**
   * Keep a final partial chunk, clamped to `end`, when the span doesn't divide
   * evenly. Default `true`, so the chunks always cover `[start, end)` exactly.
   */
  partial?: boolean;
}

/**
 * Partition `[start, end)` into adjacent, non-overlapping intervals of width
 * `by`. The union of the chunks exactly covers the span; the last chunk is
 * clamped to `end` unless `partial: false` (which drops a trailing partial).
 */
export function chunks<T extends TemporalPoint>(
  options: ChunksOptions<T>,
): Seq<Interval<T>> {
  const { start, end, by, partial = true } = options;
  return new Seq<Interval<T>>(function* () {
    if (cmp(add(start, by), start) <= 0) {
      throw new RangeError("temporal-seq: chunks() `by` must be a positive duration");
    }
    let a = start;
    while (cmp(a, end) < 0) {
      const b = add(a, by);
      if (cmp(b, end) > 0) {
        if (partial) yield new Interval<T>(a, end);
        return;
      }
      yield new Interval<T>(a, b);
      a = b;
    }
  });
}

export interface WindowsOptions<T extends TemporalPoint> {
  start: T;
  end: T;
  /** Width of each window. */
  size: DurationLike;
  /** Distance between consecutive window starts. */
  step: DurationLike;
  /**
   * Emit trailing windows that extend past `end` (clamped to `end`).
   * Default `false`, so only full-width windows fitting within `[start, end]`
   * are produced.
   */
  partial?: boolean;
}

/**
 * A lazy sequence of sliding (and generally overlapping) windows of width
 * `size`, advancing each start by `step`. By default only windows that fit
 * fully within `[start, end]` are emitted.
 */
export function windows<T extends TemporalPoint>(
  options: WindowsOptions<T>,
): Seq<Interval<T>> {
  const { start, end, size, step, partial = false } = options;
  return new Seq<Interval<T>>(function* () {
    if (cmp(add(start, step), start) <= 0) {
      throw new RangeError("temporal-seq: windows() `step` must be a positive duration");
    }
    if (cmp(add(start, size), start) <= 0) {
      throw new RangeError("temporal-seq: windows() `size` must be a positive duration");
    }
    let a = start;
    while (cmp(a, end) < 0) {
      const b = add(a, size);
      if (cmp(b, end) <= 0) {
        yield new Interval<T>(a, b);
      } else if (partial) {
        yield new Interval<T>(a, end);
      } else {
        return;
      }
      a = add(a, step);
    }
  });
}
