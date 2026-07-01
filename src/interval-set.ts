import type { Temporal } from "temporal-polyfill";
import type { TemporalPoint } from "./types.js";
import { cmp, kindOf } from "./internal.js";
import { Interval } from "./interval.js";
import { getTemporal } from "./temporal.js";

/**
 * A normalized set of intervals — sorted, with overlapping and abutting spans
 * merged into maximal disjoint pieces. Supports the set operations you need for
 * availability / free-busy work: union, intersection, difference, and gaps.
 */
export class IntervalSet<T extends TemporalPoint = TemporalPoint> implements Iterable<Interval<T>> {
  /** The normalized (sorted, merged, disjoint) intervals. */
  readonly intervals: readonly Interval<T>[];

  private constructor(intervals: Interval<T>[]) {
    this.intervals = intervals;
  }

  /** Build a normalized set from arbitrary intervals (empty spans dropped). */
  static from<T extends TemporalPoint>(intervals: Iterable<Interval<T>>): IntervalSet<T> {
    const list = [...intervals].filter((iv) => !iv.isEmpty);
    list.sort((a, b) => cmp(a.start, b.start) || cmp(a.end, b.end));
    const merged: Interval<T>[] = [];
    for (const iv of list) {
      const last = merged[merged.length - 1];
      if (last && cmp(iv.start, last.end) <= 0) {
        // overlap or abut → extend
        if (cmp(iv.end, last.end) > 0) merged[merged.length - 1] = new Interval(last.start, iv.end);
      } else {
        merged.push(iv);
      }
    }
    return new IntervalSet(merged);
  }

  /** The empty set. */
  static empty<T extends TemporalPoint>(): IntervalSet<T> {
    return new IntervalSet<T>([]);
  }

  /** True when the set covers nothing. */
  get isEmpty(): boolean {
    return this.intervals.length === 0;
  }

  /** Iterate the intervals in order. */
  [Symbol.iterator](): Iterator<Interval<T>> {
    return this.intervals[Symbol.iterator]();
  }

  /** Whether a point lies within any interval of the set. */
  contains(point: T): boolean {
    return this.intervals.some((iv) => iv.contains(point));
  }

  /** Union with another set (or intervals). */
  union(other: IntervalSet<T> | Iterable<Interval<T>>): IntervalSet<T> {
    const others = other instanceof IntervalSet ? other.intervals : [...other];
    return IntervalSet.from([...this.intervals, ...others]);
  }

  /** Intersection: the spans covered by both sets. */
  intersection(other: IntervalSet<T>): IntervalSet<T> {
    const out: Interval<T>[] = [];
    for (const a of this.intervals) {
      for (const b of other.intervals) {
        if (cmp(b.start, a.end) >= 0) break; // b (sorted) is past a
        const hit = a.intersection(b);
        if (hit) out.push(hit);
      }
    }
    return IntervalSet.from(out);
  }

  /** Difference: the parts of this set not covered by `other` (free = work − busy). */
  difference(other: IntervalSet<T>): IntervalSet<T> {
    const out: Interval<T>[] = [];
    for (const a of this.intervals) {
      let pieces: Interval<T>[] = [a];
      for (const b of other.intervals) {
        if (cmp(b.end, a.start) <= 0 || cmp(b.start, a.end) >= 0) continue;
        const next: Interval<T>[] = [];
        for (const p of pieces) {
          if (!p.overlaps(b)) {
            next.push(p);
            continue;
          }
          if (cmp(p.start, b.start) < 0) next.push(new Interval(p.start, b.start));
          if (cmp(b.end, p.end) < 0) next.push(new Interval(b.end, p.end));
        }
        pieces = next;
      }
      out.push(...pieces);
    }
    return IntervalSet.from(out);
  }

  /**
   * Gaps between covered spans. With `within`, returns the complement inside
   * that bounding interval (including leading/trailing gaps); without it,
   * returns only the interior gaps between consecutive intervals.
   */
  gaps(within?: Interval<T>): IntervalSet<T> {
    if (within) return IntervalSet.from([within]).difference(this);
    const out: Interval<T>[] = [];
    for (let i = 1; i < this.intervals.length; i++) {
      const prev = this.intervals[i - 1]!;
      const cur = this.intervals[i]!;
      if (cmp(prev.end, cur.start) < 0) out.push(new Interval(prev.end, cur.start));
    }
    return new IntervalSet(out);
  }

  /**
   * Total covered duration, summed across all intervals. Time-bearing sets sum
   * in hours; date sets in days (so the single-unit sums combine without a
   * calendar reference).
   */
  totalDuration(): Temporal.Duration {
    const T = getTemporal();
    if (this.intervals.length === 0) return T.Duration.from({ seconds: 0 });
    const k = kindOf(this.intervals[0]!.start);
    const largestUnit = k === "date" || k === "yearmonth" ? "day" : "hour";
    let total = T.Duration.from({ seconds: 0 });
    for (const iv of this.intervals) {
      total = total.add(iv.toDuration({ largestUnit } as never));
    }
    return total;
  }

  toString(): string {
    return this.intervals.map((iv) => iv.toString()).join(", ");
  }
}
