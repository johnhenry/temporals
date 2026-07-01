import type { Temporal } from "temporal-polyfill";
import type { DurationLike, TemporalPoint } from "./types.js";
import { cmp, type DiffOptions, kindOf, until } from "./internal.js";
import { range } from "./range.js";
import type { Seq } from "./seq.js";
import { getTemporal } from "./temporal.js";

/**
 * A half-open span `[start, end)` between two like-typed Temporal points.
 * Temporal has no native interval type; this fills that gap.
 */
export class Interval<T extends TemporalPoint = TemporalPoint> {
  readonly start: T;
  readonly end: T;

  constructor(start: T, end: T) {
    if (kindOf(start) !== kindOf(end)) {
      throw new TypeError(
        "temporals: Interval start and end must be the same Temporal type",
      );
    }
    this.start = start;
    this.end = end;
  }

  /** True when `start >= end` (the span contains no points). */
  get isEmpty(): boolean {
    return cmp(this.start, this.end) >= 0;
  }

  /** Whether a point falls within `[start, end)`. */
  contains(point: T): boolean {
    return cmp(this.start, point) <= 0 && cmp(point, this.end) < 0;
  }

  /** Whether this interval shares any point with another (half-open). */
  overlaps(other: Interval<T>): boolean {
    return cmp(this.start, other.end) < 0 && cmp(other.start, this.end) < 0;
  }

  /** Whether this interval fully contains another. */
  encloses(other: Interval<T>): boolean {
    return cmp(this.start, other.start) <= 0 && cmp(other.end, this.end) <= 0;
  }

  /** The overlapping span, or `null` if the intervals are disjoint. */
  intersection(other: Interval<T>): Interval<T> | null {
    const start = cmp(this.start, other.start) >= 0 ? this.start : other.start;
    const end = cmp(this.end, other.end) <= 0 ? this.end : other.end;
    if (cmp(start, end) >= 0) return null;
    return new Interval(start, end);
  }

  /** The duration of the span (`start.until(end)`). */
  toDuration(opts?: DiffOptions): Temporal.Duration {
    return until(this.start, this.end, opts);
  }

  /** A lazy sequence of points within the interval `[start, end)`, stepped by `step`. */
  points(step: DurationLike): Seq<T> {
    return range({ start: this.start, end: this.end, step });
  }

  /** ISO 8601 interval string, `start/end`. */
  toString(): string {
    return `${this.start.toString()}/${this.end.toString()}`;
  }

  toJSON(): string {
    return this.toString();
  }

  /**
   * Parse an ISO 8601 interval string (`start/end`). The point type is inferred
   * from the syntax of the operands:
   *  - contains `[Zone]`  → ZonedDateTime
   *  - contains `T`       → PlainDateTime
   *  - otherwise          → PlainDate
   *
   * Requires a resolvable Temporal implementation (see {@link getTemporal}).
   */
  static from(iso: string): Interval {
    // Split on the separator "/", ignoring slashes inside a `[Zone/Name]` block.
    let depth = 0;
    let slash = -1;
    for (let i = 0; i < iso.length; i++) {
      const ch = iso[i];
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      else if (ch === "/" && depth === 0) {
        slash = i;
        break;
      }
    }
    if (slash < 0) {
      throw new RangeError(
        `temporals: invalid ISO interval "${iso}" (expected "start/end")`,
      );
    }
    const startStr = iso.slice(0, slash);
    const endStr = iso.slice(slash + 1);
    const T = getTemporal();
    const parse = (s: string): TemporalPoint => {
      if (s.includes("[")) return T.ZonedDateTime.from(s);
      if (s.includes("T")) return T.PlainDateTime.from(s);
      return T.PlainDate.from(s);
    };
    return new Interval(parse(startStr), parse(endStr));
  }
}
