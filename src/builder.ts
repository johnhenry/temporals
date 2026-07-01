import type {
  DurationLike,
  Frequency,
  Overflow,
  TemporalPoint,
  Weekday,
  WeekdaySpec,
} from "./types.js";
import { Seq } from "./seq.js";
import { range } from "./range.js";
import { chunks, windows } from "./intervals.js";
import { Interval } from "./interval.js";
import { formatRule, recur, type RecurRule } from "./recur.js";

/**
 * A thin, discoverable wrapper over {@link range} / {@link chunks} /
 * {@link windows}. It holds no logic of its own — every terminal delegates to a
 * core generator and returns a {@link Seq} (or array), so the iterator-helper
 * surface remains available downstream.
 */
export class SeqBuilder<T extends TemporalPoint> implements Iterable<T> {
  #start: T;
  #step?: DurationLike;
  #end?: T;
  #count?: number;
  #inclusive = false;
  #overflow?: Overflow;

  constructor(start: T) {
    this.#start = start;
  }

  /** Set the increment between points (required before iterating). */
  step(step: DurationLike): this {
    this.#step = step;
    return this;
  }

  /** Bound the sequence with an exclusive end (half-open `[start, end)`). */
  until(end: T): this {
    this.#end = end;
    this.#inclusive = false;
    return this;
  }

  /** Bound the sequence with an inclusive end (`[start, end]`). */
  through(end: T): this {
    this.#end = end;
    this.#inclusive = true;
    return this;
  }

  /** Limit to at most `n` points. */
  count(n: number): this {
    this.#count = n;
    return this;
  }

  /** Overflow behaviour for calendar arithmetic. */
  overflow(mode: Overflow): this {
    this.#overflow = mode;
    return this;
  }

  #requireStep(): DurationLike {
    if (this.#step === undefined) {
      throw new RangeError("temporals: call .step(...) before iterating a seq() builder");
    }
    return this.#step;
  }

  /** Materialise as a lazy point sequence. */
  points(): Seq<T> {
    return range({
      start: this.#start,
      end: this.#end,
      count: this.#count,
      step: this.#requireStep(),
      inclusive: this.#inclusive,
      overflow: this.#overflow,
    });
  }

  /** Iterate the resulting sequence. */
  [Symbol.iterator](): Iterator<T> {
    return this.points()[Symbol.iterator]();
  }

  /** Materialise the resulting sequence into an array. */
  toArray(): T[] {
    return this.points().toArray();
  }

  #requireEnd(): T {
    if (this.#end === undefined) {
      throw new RangeError("temporals: set an end with .until(...) before requesting intervals");
    }
    return this.#end;
  }

  /** Partition `[start, end)` into adjacent intervals of width `by`. */
  chunks(by: DurationLike, opts?: { partial?: boolean }): Seq<Interval<T>> {
    return chunks({ start: this.#start, end: this.#requireEnd(), by, partial: opts?.partial });
  }

  /** Alias of {@link chunks}. */
  intervals(by: DurationLike, opts?: { partial?: boolean }): Seq<Interval<T>> {
    return this.chunks(by, opts);
  }

  /** Sliding windows of width `size`, advancing by `step`. */
  windows(size: DurationLike, step: DurationLike, opts?: { partial?: boolean }): Seq<Interval<T>> {
    return windows({ start: this.#start, end: this.#requireEnd(), size, step, partial: opts?.partial });
  }
}

/** Begin a fluent point/interval sequence from `start`. */
export function seq<T extends TemporalPoint>(start: T): SeqBuilder<T> {
  return new SeqBuilder(start);
}

/**
 * A thin, discoverable wrapper over {@link recur}. Accumulates an RFC 5545-style
 * {@link RecurRule} and delegates to the engine on materialisation.
 */
export class RecurBuilder<T extends TemporalPoint> implements Iterable<T> {
  #rule: RecurRule<T>;

  constructor(start: T, freq: Frequency = "daily") {
    this.#rule = { start, freq };
  }

  /** Set frequency to daily. */
  daily(): this {
    this.#rule.freq = "daily";
    return this;
  }
  /** Set frequency to weekly. */
  weekly(): this {
    this.#rule.freq = "weekly";
    return this;
  }
  /** Set frequency to monthly. */
  monthly(): this {
    this.#rule.freq = "monthly";
    return this;
  }
  /** Set frequency to yearly. */
  yearly(): this {
    this.#rule.freq = "yearly";
    return this;
  }

  /** Set the interval (every N periods). */
  every(interval: number): this {
    this.#rule.interval = interval;
    return this;
  }

  /** Restrict/expand by weekday(s) (BYDAY): `"MO"` or `{ weekday, nth }`. */
  on(...weekdays: WeekdaySpec[]): this {
    this.#rule.byWeekday = [...(this.#rule.byWeekday ?? []), ...weekdays];
    return this;
  }

  /** Restrict/expand by day(s) of month (BYMONTHDAY), negatives count from end. */
  onDay(...days: number[]): this {
    this.#rule.byMonthDay = [...(this.#rule.byMonthDay ?? []), ...days];
    return this;
  }

  /** Restrict to month(s) (BYMONTH, 1–12). */
  inMonth(...months: number[]): this {
    this.#rule.byMonth = [...(this.#rule.byMonth ?? []), ...months];
    return this;
  }

  /** Select the nth occurrence(s) within each period (BYSETPOS). */
  setPos(...positions: number[]): this {
    this.#rule.bySetPos = [...(this.#rule.bySetPos ?? []), ...positions];
    return this;
  }

  /** Set the week start (WKST). */
  weekStartOn(weekday: Weekday): this {
    this.#rule.weekStart = weekday;
    return this;
  }

  /** Stop after `n` instances. */
  count(n: number): this {
    this.#rule.count = n;
    return this;
  }

  /** Stop at `point`, inclusive. */
  until(point: T): this {
    this.#rule.until = point;
    return this;
  }

  /** The accumulated rule object. */
  get rule(): RecurRule<T> {
    return { ...this.#rule };
  }

  /** Materialise as a lazy recurrence sequence. */
  points(): Seq<T> {
    return recur(this.#rule);
  }

  /** Iterate the resulting sequence. */
  [Symbol.iterator](): Iterator<T> {
    return this.points()[Symbol.iterator]();
  }

  /** Materialise the resulting sequence into an array. */
  toArray(): T[] {
    return this.points().toArray();
  }

  /** Serialise to an RFC 5545 RRULE string. */
  toString(): string {
    return formatRule(this.#rule);
  }
}

/** Begin a fluent recurrence from `start` (optionally seeding the frequency). */
export function recurBuilder<T extends TemporalPoint>(
  start: T,
  freq: Frequency = "daily",
): RecurBuilder<T> {
  return new RecurBuilder(start, freq);
}
