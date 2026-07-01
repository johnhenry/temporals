import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { Interval, IntervalSet } from "../src/index.js";

const D = (n: number) => Temporal.PlainDate.from(`2026-01-0${n}`);
const iv = (a: number, b: number) => new Interval(D(a), D(b));
const strs = (set: IntervalSet) => set.intervals.map((i) => i.toString());

test("IntervalSet.from merges overlapping and abutting intervals", () => {
  assert.deepEqual(strs(IntervalSet.from([iv(1, 3), iv(2, 5), iv(6, 8)])), [
    "2026-01-01/2026-01-05",
    "2026-01-06/2026-01-08",
  ]);
  // abutting [1,2)+[2,4) merge into [1,4)
  assert.deepEqual(strs(IntervalSet.from([iv(1, 2), iv(2, 4)])), ["2026-01-01/2026-01-04"]);
});

test("IntervalSet union / intersection / difference", () => {
  const a = IntervalSet.from([iv(1, 5), iv(6, 8)]);
  const b = IntervalSet.from([iv(2, 7)]);
  assert.deepEqual(strs(a.union(b)), ["2026-01-01/2026-01-08"]);
  assert.deepEqual(strs(a.intersection(b)), ["2026-01-02/2026-01-05", "2026-01-06/2026-01-07"]);
  assert.deepEqual(strs(a.difference(b)), ["2026-01-01/2026-01-02", "2026-01-07/2026-01-08"]);
});

test("IntervalSet gaps (interior and within a bound)", () => {
  const a = IntervalSet.from([iv(1, 3), iv(6, 8)]);
  assert.deepEqual(strs(a.gaps()), ["2026-01-03/2026-01-06"]);
  assert.deepEqual(strs(a.gaps(iv(1, 9))), ["2026-01-03/2026-01-06", "2026-01-08/2026-01-09"]);
});

test("free = work − busy (availability)", () => {
  const work = IntervalSet.from([iv(1, 6)]);
  const busy = IntervalSet.from([iv(2, 3), iv(4, 5)]);
  assert.deepEqual(strs(work.difference(busy)), [
    "2026-01-01/2026-01-02",
    "2026-01-03/2026-01-04",
    "2026-01-05/2026-01-06",
  ]);
});

test("Allen relations", () => {
  assert.equal(iv(1, 3).relation(iv(3, 5)), "meets");
  assert.equal(iv(1, 5).relation(iv(2, 3)), "contains");
  assert.equal(iv(2, 3).relation(iv(1, 5)), "during");
  assert.equal(iv(1, 3).relation(iv(2, 5)), "overlaps");
  assert.equal(iv(1, 3).relation(iv(1, 5)), "starts");
  assert.equal(iv(3, 5).relation(iv(1, 5)), "finishes");
  assert.equal(iv(1, 5).relation(iv(1, 5)), "equals");
  assert.equal(iv(1, 2).relation(iv(4, 5)), "before");
});

test("IntervalSet totalDuration (hours for zoned)", () => {
  const Z = (s: string) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);
  const set = IntervalSet.from([
    new Interval(Z("2026-01-02T09:00"), Z("2026-01-02T17:00")),
    new Interval(Z("2026-01-03T09:00"), Z("2026-01-03T13:00")),
  ]);
  assert.equal(set.totalDuration().hours, 12);
});
