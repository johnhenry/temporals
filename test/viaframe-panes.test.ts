// The viaframe pane package (viaframe/): its adapter (viaframe/src/lib.ts) and every pane's own tests,
// run here without viaframe. Each pane's code is called the way viaframe calls an eval pane in function
// mode (an async function of its inputs), with the library as `T`, and each test's `expect` is checked.
// viaframe's own review (`viaframe pkg test`, in viaframe/) runs the same tests in its sandbox; this
// keeps them in the library's gate, where the viaframe command line isn't installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../viaframe/src/lib.js";
// @ts-expect-error: plain JavaScript data, no declarations
import { PANES } from "../viaframe/src/panes.mjs";

type Input = { name: string; value: unknown };
type PaneTest = { name: string; inputs?: Record<string, unknown>; expect: Record<string, unknown> };
type Pane = { id: string; inputs: Input[]; outputs: string[]; code: string; tests: PaneTest[] };

const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;

async function runPane(pane: Pane, inputs: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const names = pane.inputs.map((i) => i.name);
  const values = pane.inputs.map((i) => (i.name in inputs ? inputs[i.name] : i.value));
  const fn = new AsyncFunction("T", ...names, pane.code);
  return (await fn(T, ...values)) as Record<string, unknown>;
}

for (const pane of PANES as Pane[]) {
  for (const t of pane.tests) {
    test(`viaframe pane ${pane.id}: ${t.name}`, async () => {
      const result = await runPane(pane, t.inputs);
      assert.deepEqual(Object.keys(result).sort(), [...pane.outputs].sort(), "returns exactly its outputs");
      for (const [key, want] of Object.entries(t.expect)) {
        assert.ok(key.startsWith("result."), `${key}: the tests read the result pane's outputs`);
        assert.deepEqual(result[key.slice("result.".length)], want, key);
      }
    });
  }
}

test("viaframe adapter: zoned reads offsets, bracketed zones, wall-clock times and epoch milliseconds", () => {
  assert.equal(T.iso(T.zoned("2026-10-23T18:00:00Z", "America/New_York")), "2026-10-23T14:00:00-04:00[America/New_York]");
  assert.equal(T.iso(T.zoned("2026-10-23T09:00:00+02:00[Europe/Paris]", "UTC")), "2026-10-23T07:00:00+00:00[UTC]");
  assert.equal(T.iso(T.zoned("2026-10-23T09:00", "Asia/Tokyo")), "2026-10-23T09:00:00+09:00[Asia/Tokyo]");
  assert.equal(T.iso(T.zoned(0, "UTC")), "1970-01-01T00:00:00+00:00[UTC]");
  assert.throws(() => T.zoned("", "UTC"), /no time given/);
});

test("viaframe adapter: durations from milliseconds, ISO and shorthand", () => {
  assert.equal(T.duration(5400000).toString(), "PT1H30M");
  assert.equal(T.duration("90061000").toString(), "P1DT1H1M1S");
  assert.equal(T.duration("pt2h").toString(), "PT2H");
  assert.equal(T.duration("1h 30m").toString(), "PT1H30M");
  assert.equal(T.durationMs(T.duration("1d")), 86400000);
  assert.throws(() => T.durationMs(T.duration("P1M")), /no fixed length/);
  assert.equal(T.words(5400000, { short: true }), "1h 30m");
  assert.equal(T.words(93784000, { largestUnit: "hour" }), "26 hours, 3 minutes, 4 seconds");
});

test("viaframe adapter: holiday specs and weekdays", () => {
  const D = (s: string) => T.Temporal().PlainDate.from(s);
  const us = T.businessCalendar({ holidays: ["us-federal"] });
  assert.equal(us.isBusinessDay(D("2026-11-26")), false); // Thanksgiving
  assert.equal(us.isBusinessDay(D("2026-07-03")), false); // Independence Day on a Saturday, observed Friday
  assert.equal(us.isBusinessDay(D("2026-11-27")), true);
  // New Year's Day 2028 is a Saturday: observed on Friday 31 December 2027.
  assert.equal(us.isBusinessDay(D("2027-12-31")), false);
  const uk = T.businessCalendar({ holidays: ["good-friday", "easter-monday", "12-25", "2026-08-31", { month: 5, weekday: "MO", nth: 1 }] });
  for (const off of ["2026-04-03", "2026-04-06", "2026-12-25", "2026-08-31", "2026-05-04"]) assert.equal(uk.isBusinessDay(D(off)), false, off);
  assert.equal(uk.isBusinessDay(D("2027-08-31")), true); // a dated holiday is that year only
  assert.equal(T.weekdayCode(7), "SU");
  assert.equal(T.weekdayCode("saturday"), "SA");
  assert.throws(() => T.weekdayCode("x"), /not a weekday/);
  assert.throws(() => T.holidayRules("someday"), /not a holiday/);
});
