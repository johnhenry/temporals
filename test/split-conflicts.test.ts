import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { recur, splitSeries, conflicts, Interval } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const strs = (it: Iterable<{ toString(): string }>) => [...it].map((x) => x.toString());

test("splitSeries: count-based series divides cleanly", () => {
  const rule = { start: D("2026-01-01"), freq: "monthly" as const, byWeekday: [{ weekday: "TU" as const, nth: 2 }], count: 6 };
  const all = recur(rule).toArray();
  const { before, after } = splitSeries(rule, all[2]!); // split at the 3rd occurrence
  assert.deepEqual(strs(recur(before)), strs(all.slice(0, 2)));
  assert.deepEqual(strs(recur(after)), strs(all.slice(2)));
  // the two halves reproduce the original
  assert.deepEqual([...strs(recur(before)), ...strs(recur(after))], strs(all));
});

test("splitSeries: until-based series", () => {
  const rule = { start: D("2026-01-01"), freq: "daily" as const, until: D("2026-01-05") };
  const { before, after } = splitSeries(rule, D("2026-01-03"));
  assert.deepEqual(strs(recur(before)), ["2026-01-01", "2026-01-02"]);
  assert.deepEqual(strs(recur(after)), ["2026-01-03", "2026-01-04", "2026-01-05"]);
});

test("splitSeries: partitions EXDATE across the cut", () => {
  const rule = { start: D("2026-01-01"), freq: "daily" as const, count: 5, exclude: [D("2026-01-02"), D("2026-01-10")] };
  const { before, after } = splitSeries(rule, D("2026-01-04"));
  assert.deepEqual(before.exclude!.map(String), ["2026-01-02"]);
  assert.deepEqual(after.exclude!.map(String), ["2026-01-10"]);
  assert.deepEqual(strs(recur(before)), ["2026-01-01", "2026-01-03"]);
  assert.deepEqual(strs(recur(after)), ["2026-01-04", "2026-01-05", "2026-01-06"]);
});

test("splitSeries: rejects a non-occurrence split point", () => {
  assert.throws(
    () => splitSeries({ start: D("2026-01-01"), freq: "monthly", byWeekday: [{ weekday: "TU", nth: 2 }] }, D("2026-01-14")),
    /must be an occurrence/,
  );
});

test("conflicts: finds all overlapping pairs (half-open)", () => {
  const iv = (a: number, b: number) => new Interval(D(`2026-01-0${a}`), D(`2026-01-0${b}`));
  const pairs = conflicts([iv(1, 4), iv(2, 5), iv(6, 8), iv(3, 7)]);
  assert.equal(pairs.length, 4);
  const asStr = pairs.map(([a, b]) => `${a.toString()} x ${b.toString()}`);
  assert.ok(asStr.includes("2026-01-01/2026-01-04 x 2026-01-02/2026-01-05"));
  assert.ok(asStr.includes("2026-01-03/2026-01-07 x 2026-01-06/2026-01-08"));
});

test("conflicts: abutting intervals do not conflict; disjoint sets are empty", () => {
  const iv = (a: number, b: number) => new Interval(D(`2026-01-0${a}`), D(`2026-01-0${b}`));
  assert.deepEqual(conflicts([iv(1, 3), iv(3, 5)]), []); // touch at 3, no overlap
  assert.deepEqual(conflicts([iv(1, 2), iv(3, 4)]), []); // disjoint
});
