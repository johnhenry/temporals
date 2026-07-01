/**
 * A lazy, re-iterable sequence with the iterator-helper surface
 * (`map`/`filter`/`take`/`toArray`/…). On runtimes that ship native iterator
 * helpers (Node 22+, modern browsers) those work on the underlying iterators
 * too; `Seq` provides the same methods portably so the library behaves
 * identically on older runtimes (e.g. Node 20).
 *
 * Unlike a bare native iterator, a `Seq` is **re-iterable**: it wraps a factory
 * and produces a fresh iterator each time it is consumed.
 */
export class Seq<T> implements Iterable<T> {
  /** @internal */
  readonly #factory: () => Iterator<T>;

  constructor(factory: () => Iterator<T> | Iterable<T>) {
    this.#factory = () => {
      const made = factory();
      const it = made as Iterable<T> & Iterator<T>;
      return typeof it[Symbol.iterator] === "function"
        ? it[Symbol.iterator]()
        : (made as Iterator<T>);
    };
  }

  /** Produce a fresh iterator (the sequence is re-iterable). */
  [Symbol.iterator](): Iterator<T> {
    return this.#factory();
  }

  /** Wrap any iterable (or a factory producing one) as a re-iterable Seq. */
  static from<T>(source: Iterable<T> | (() => Iterable<T> | Iterator<T>)): Seq<T> {
    if (typeof source === "function") return new Seq(source);
    return new Seq(() => source[Symbol.iterator]());
  }

  /** A Seq over the given values. */
  static of<T>(...values: T[]): Seq<T> {
    return new Seq(() => values[Symbol.iterator]());
  }

  /** The empty Seq. */
  static empty<T>(): Seq<T> {
    return new Seq<T>(function* () {});
  }

  // --- lazy transforms -----------------------------------------------------

  /** Lazily transform each value (index provided). */
  map<U>(fn: (value: T, index: number) => U): Seq<U> {
    const self = this;
    return new Seq<U>(function* () {
      let i = 0;
      for (const x of self) yield fn(x, i++);
    });
  }

  /** Keep only values for which `pred` is true. */
  filter(pred: (value: T, index: number) => boolean): Seq<T> {
    const self = this;
    return new Seq<T>(function* () {
      let i = 0;
      for (const x of self) if (pred(x, i++)) yield x;
    });
  }

  /** Map each value to an iterable and flatten the results. */
  flatMap<U>(fn: (value: T, index: number) => Iterable<U>): Seq<U> {
    const self = this;
    return new Seq<U>(function* () {
      let i = 0;
      for (const x of self) yield* fn(x, i++);
    });
  }

  /** The first `n` values (fewer if the sequence is shorter). Bounds infinite sequences. */
  take(n: number): Seq<T> {
    const self = this;
    return new Seq<T>(function* () {
      if (n <= 0) return;
      let i = 0;
      for (const x of self) {
        yield x;
        if (++i >= n) return;
      }
    });
  }

  /** Skip the first `n` values, yielding the rest. */
  drop(n: number): Seq<T> {
    const self = this;
    return new Seq<T>(function* () {
      let i = 0;
      for (const x of self) {
        if (i++ < n) continue;
        yield x;
      }
    });
  }

  /** Yield values until `pred` is first false, then stop. */
  takeWhile(pred: (value: T, index: number) => boolean): Seq<T> {
    const self = this;
    return new Seq<T>(function* () {
      let i = 0;
      for (const x of self) {
        if (!pred(x, i++)) return;
        yield x;
      }
    });
  }

  /** Skip leading values while `pred` is true, then yield the rest. */
  dropWhile(pred: (value: T, index: number) => boolean): Seq<T> {
    const self = this;
    return new Seq<T>(function* () {
      let i = 0;
      let dropping = true;
      for (const x of self) {
        if (dropping && pred(x, i++)) continue;
        dropping = false;
        yield x;
      }
    });
  }

  /** Run a side effect for each value as it flows through (lazy). */
  tap(fn: (value: T, index: number) => void): Seq<T> {
    const self = this;
    return new Seq<T>(function* () {
      let i = 0;
      for (const x of self) {
        fn(x, i++);
        yield x;
      }
    });
  }

  /** Append one or more iterables after this sequence. */
  concat(...others: Iterable<T>[]): Seq<T> {
    const self = this;
    return new Seq<T>(function* () {
      yield* self;
      for (const o of others) yield* o;
    });
  }

  /** Yield consecutive overlapping pairs: `[a,b], [b,c], …`. */
  pairwise(): Seq<[T, T]> {
    const self = this;
    return new Seq<[T, T]>(function* () {
      let prev: T;
      let has = false;
      for (const x of self) {
        if (has) yield [prev!, x] as [T, T];
        prev = x;
        has = true;
      }
    });
  }

  // --- terminals -----------------------------------------------------------

  /** Materialise into an array. Never call on an unbounded sequence. */
  toArray(): T[] {
    return [...this];
  }

  /** Run `fn` for each value (index provided). */
  forEach(fn: (value: T, index: number) => void): void {
    let i = 0;
    for (const x of this) fn(x, i++);
  }

  /** Fold the sequence to a single accumulated value. */
  reduce<A>(fn: (acc: A, value: T, index: number) => A, initial: A): A {
    let acc = initial;
    let i = 0;
    for (const x of this) acc = fn(acc, x, i++);
    return acc;
  }

  /** The first value matching `pred`, or `undefined`. */
  find(pred: (value: T, index: number) => boolean): T | undefined {
    let i = 0;
    for (const x of this) if (pred(x, i++)) return x;
    return undefined;
  }

  /** Whether any value matches `pred` (short-circuits). */
  some(pred: (value: T, index: number) => boolean): boolean {
    let i = 0;
    for (const x of this) if (pred(x, i++)) return true;
    return false;
  }

  /** Whether every value matches `pred` (short-circuits). */
  every(pred: (value: T, index: number) => boolean): boolean {
    let i = 0;
    for (const x of this) if (!pred(x, i++)) return false;
    return true;
  }

  /** The first value, or `undefined` if empty. */
  first(): T | undefined {
    for (const x of this) return x;
    return undefined;
  }

  /** The value at `index` (0-based), or `undefined`. */
  at(index: number): T | undefined {
    if (index < 0) return undefined;
    let i = 0;
    for (const x of this) {
      if (i++ === index) return x;
    }
    return undefined;
  }

  /** Count elements. Never call on an unbounded sequence. */
  count(): number {
    let n = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of this) n++;
    return n;
  }
}
