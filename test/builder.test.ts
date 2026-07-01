import { test } from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "temporal-polyfill";
import { seq, recurBuilder } from "../src/index.js";

const D = (s: string) => Temporal.PlainDate.from(s);
const strs = (it: Iterable<{ toString(): string }>) => [...it].map((x) => x.toString());

test("SeqBuilder: step / until / through / count / overflow / points", () => {
  assert.deepEqual(strs(seq(D("2026-01-01")).step({ days: 1 }).until(D("2026-01-04"))), [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
  ]);
  // through() is inclusive
  assert.deepEqual(strs(seq(D("2026-01-01")).step({ days: 1 }).through(D("2026-01-03"))), [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
  ]);
  assert.equal(seq(D("2026-01-01")).step({ days: 2 }).count(3).toArray().length, 3);
  // overflow reject on a month-end step throws when iterated
  assert.throws(() => seq(D("2026-01-31")).step({ months: 1 }).count(2).overflow("reject").toArray(), /./);
  // directly iterable
  assert.deepEqual(strs([...seq(D("2026-01-01")).step({ days: 1 }).count(2)]), ["2026-01-01", "2026-01-02"]);
});

test("SeqBuilder: chunks / intervals / windows terminals", () => {
  const base = seq(D("2026-01-01")).step({ days: 1 }).until(D("2026-03-01"));
  assert.deepEqual(strs(base.chunks({ months: 1 })), ["2026-01-01/2026-02-01", "2026-02-01/2026-03-01"]);
  assert.deepEqual(strs(base.intervals({ months: 1 })), ["2026-01-01/2026-02-01", "2026-02-01/2026-03-01"]);
  const w = seq(D("2026-01-01")).step({ days: 1 }).until(D("2026-01-10")).windows({ days: 7 }, { days: 3 });
  assert.deepEqual(strs(w), ["2026-01-01/2026-01-08"]);
  // chunks without an end throws
  assert.throws(() => seq(D("2026-01-01")).step({ days: 1 }).chunks({ weeks: 1 }).toArray(), /end/);
});

test("RecurBuilder: every / on / count / rule / toString / iterate", () => {
  const b = recurBuilder(D("2026-01-05")).weekly().every(2).on("MO", "WE").count(4);
  assert.deepEqual(strs(b), ["2026-01-05", "2026-01-07", "2026-01-19", "2026-01-21"]);
  assert.equal(b.rule.freq, "weekly");
  assert.equal(b.rule.interval, 2);
  assert.deepEqual(strs([...recurBuilder(D("2026-01-01")).daily().count(2)]), ["2026-01-01", "2026-01-02"]);
});

test("RecurBuilder: onDay / inMonth / setPos / weekStartOn / until", () => {
  assert.deepEqual(
    strs(recurBuilder(D("2026-01-01")).monthly().onDay(1, 15).count(3)),
    ["2026-01-01", "2026-01-15", "2026-02-01"],
  );
  // last weekday of month via setPos
  assert.deepEqual(
    strs(recurBuilder(D("2026-01-01")).monthly().on("MO", "TU", "WE", "TH", "FR").setPos(-1).count(2)),
    ["2026-01-30", "2026-02-27"],
  );
  // yearly + inMonth + nth weekday: 2nd Sunday in March
  assert.deepEqual(
    strs(recurBuilder(D("2026-01-01")).yearly().inMonth(3).on({ weekday: "SU", nth: 2 }).count(1)),
    ["2026-03-08"],
  );
  // weekStartOn + until (bounded)
  const wk = recurBuilder(D("2026-01-01")).weekly().weekStartOn("SU").until(D("2026-01-20")).toArray();
  assert.ok(wk.length >= 2 && wk.length <= 4);
});

test("RecurBuilder: toString serialises to RRULE", () => {
  assert.equal(
    recurBuilder(D("2026-01-01")).monthly().on({ weekday: "FR", nth: -1 }).count(3).toString(),
    "FREQ=MONTHLY;COUNT=3;BYDAY=-1FR",
  );
});
