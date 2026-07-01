import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { Seq, range, seq } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);

test("Seq: iterator-helper composition (map/filter/take/drop/toArray)", () => {
  const out = Seq.from([1, 2, 3, 4, 5, 6])
    .filter((x) => x % 2 === 0)
    .map((x) => x * 10)
    .drop(1)
    .take(1)
    .toArray();
  assert.deepEqual(out, [40]);
});

test("Seq: takeWhile / dropWhile / flatMap / pairwise", () => {
  assert.deepEqual(Seq.from([1, 2, 3, 4, 1]).takeWhile((x) => x < 4).toArray(), [1, 2, 3]);
  assert.deepEqual(Seq.from([1, 2, 3, 4, 1]).dropWhile((x) => x < 4).toArray(), [4, 1]);
  assert.deepEqual(Seq.from([1, 2]).flatMap((x) => [x, x]).toArray(), [1, 1, 2, 2]);
  assert.deepEqual(Seq.from([1, 2, 3]).pairwise().toArray(), [
    [1, 2],
    [2, 3],
  ]);
});

test("Seq: terminals (reduce/find/some/every/first/at/count)", () => {
  const s = Seq.from([1, 2, 3, 4]);
  assert.equal(s.reduce((a, b) => a + b, 0), 10);
  assert.equal(s.find((x) => x > 2), 3);
  assert.equal(s.some((x) => x > 3), true);
  assert.equal(s.every((x) => x > 0), true);
  assert.equal(s.first(), 1);
  assert.equal(s.at(2), 3);
  assert.equal(s.count(), 4);
});

test("Seq: is re-iterable", () => {
  const s = Seq.from(function* () {
    yield 1;
    yield 2;
  });
  assert.deepEqual(s.toArray(), [1, 2]);
  assert.deepEqual(s.toArray(), [1, 2]);
});

test("range returns a Seq usable with native for..of", () => {
  const out: string[] = [];
  for (const d of range({ start: D("2026-01-01"), count: 2, step: { days: 1 } })) {
    out.push(d.toString());
  }
  assert.deepEqual(out, ["2026-01-01", "2026-01-02"]);
});

test("seq() builder: points, until, and chunks", () => {
  const points = seq(D("2026-01-01")).step({ days: 1 }).until(D("2026-01-04")).toArray();
  assert.deepEqual(points.map(String), ["2026-01-01", "2026-01-02", "2026-01-03"]);

  const intervals = seq(D("2026-01-01"))
    .step({ days: 1 })
    .until(D("2026-03-01"))
    .chunks({ months: 1 })
    .toArray();
  assert.deepEqual(intervals.map((i) => i.toString()), [
    "2026-01-01/2026-02-01",
    "2026-02-01/2026-03-01",
  ]);
});

test("seq() builder: requires step before iterating", () => {
  assert.throws(() => seq(D("2026-01-01")).toArray(), /step/);
});
