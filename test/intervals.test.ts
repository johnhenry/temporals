import { test } from "node:test";
import assert from "node:assert/strict";
import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { chunks, windows, Interval } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);

test("chunks: partitions a span and covers it exactly", () => {
  const out = chunks({ start: D("2026-01-01"), end: D("2026-04-01"), by: { months: 1 } }).toArray();
  assert.deepEqual(
    out.map((i) => i.toString()),
    ["2026-01-01/2026-02-01", "2026-02-01/2026-03-01", "2026-03-01/2026-04-01"],
  );
});

test("chunks: final partial chunk is clamped to end by default", () => {
  const out = chunks({ start: D("2026-01-01"), end: D("2026-01-10"), by: { weeks: 1 } }).toArray();
  assert.deepEqual(
    out.map((i) => i.toString()),
    ["2026-01-01/2026-01-08", "2026-01-08/2026-01-10"],
  );
});

test("chunks: partial:false drops the trailing partial chunk", () => {
  const out = chunks({
    start: D("2026-01-01"),
    end: D("2026-01-10"),
    by: { weeks: 1 },
    partial: false,
  }).toArray();
  assert.deepEqual(out.map((i) => i.toString()), ["2026-01-01/2026-01-08"]);
});

test("windows: sliding full-width windows only", () => {
  const out = windows({
    start: D("2026-01-01"),
    end: D("2026-01-10"),
    size: { days: 7 },
    step: { days: 1 },
  }).toArray();
  assert.deepEqual(
    out.map((i) => i.toString()),
    ["2026-01-01/2026-01-08", "2026-01-02/2026-01-09", "2026-01-03/2026-01-10"],
  );
});

test("Interval: contains / overlaps / intersection", () => {
  const a = new Interval(D("2026-01-01"), D("2026-02-01"));
  const b = new Interval(D("2026-01-15"), D("2026-03-01"));
  assert.equal(a.contains(D("2026-01-01")), true); // start inclusive
  assert.equal(a.contains(D("2026-02-01")), false); // end exclusive
  assert.equal(a.overlaps(b), true);
  assert.equal(a.intersection(b)!.toString(), "2026-01-15/2026-02-01");

  const c = new Interval(D("2026-03-01"), D("2026-04-01"));
  assert.equal(a.overlaps(c), false);
  assert.equal(a.intersection(c), null);
});

test("Interval: points() iterates inside the span", () => {
  const a = new Interval(D("2026-01-01"), D("2026-01-04"));
  assert.deepEqual(
    a.points({ days: 1 }).toArray().map(String),
    ["2026-01-01", "2026-01-02", "2026-01-03"],
  );
});

test("Interval: toDuration", () => {
  const a = new Interval(D("2026-01-01"), D("2026-01-08"));
  assert.equal(a.toDuration({ largestUnit: "day" }).days, 7);
});

test("Interval.from parses an ISO interval (date, datetime, zoned)", () => {
  const d = Interval.from("2026-01-01/2026-02-01");
  assert.equal(d.start.constructor.name, "PlainDate");
  assert.equal(d.toString(), "2026-01-01/2026-02-01");

  const dt = Interval.from("2026-01-01T09:00/2026-01-01T17:00");
  assert.equal(dt.start.constructor.name, "PlainDateTime");

  const z = Interval.from("2026-01-01T00:00[America/New_York]/2026-01-02T00:00[America/New_York]");
  assert.equal(z.start.constructor.name, "ZonedDateTime");
});

test("Interval: rejects mismatched endpoint types", () => {
  assert.throws(
    () => new Interval(D("2026-01-01") as never, Temporal.PlainDateTime.from("2026-01-02T00:00") as never),
    /same Temporal type/,
  );
});
