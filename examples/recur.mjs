// recur — RRULE recurrence, EXDATE/RDATE, DST policy, builder, string interop.
//   node examples/recur.mjs
import "temporal-polyfill/global";
import { recur, recurFromString, formatRule, recurBuilder } from "temporals";

const D = (s) => Temporal.PlainDate.from(s);
const Z = (s) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);
const show = (label, it) => console.log(label, [...it].map(String).join(", "));

show(
  "2nd Tuesday monthly:",
  recur({ start: D("2026-01-01"), freq: "monthly", byWeekday: [{ weekday: "TU", nth: 2 }], count: 4 }),
);
show("last day of month:", recur({ start: D("2026-01-01"), freq: "monthly", byMonthDay: [-1], count: 3 }));
show("biweekly Mon & Wed:", recur({ start: D("2026-01-05"), freq: "weekly", interval: 2, byWeekday: ["MO", "WE"], count: 4 }));

// EXDATE / RDATE.
show(
  "daily, skipping two days + adding one:",
  recur({ start: D("2026-01-01"), freq: "daily", count: 4, exclude: [D("2026-01-02")], include: [D("2026-06-15")] }),
);

// DST policy on a zoned recurrence (03-08 spring-forward gap).
console.log(
  "zoned daily across DST (skip gap):",
  recur({ start: Z("2026-03-07T02:30"), freq: "daily", count: 3, dstGap: "skip" }).toArray().map((z) => z.toString()).join(", "),
);

// Builder + RRULE-string interop.
show("builder — last Friday monthly:", recurBuilder(D("2026-01-01")).monthly().on({ weekday: "FR", nth: -1 }).count(3));
show("from RRULE string:", recurFromString("FREQ=MONTHLY;BYDAY=2TU;COUNT=3", D("2026-01-01")));
console.log("formatRule:", formatRule({ start: D("2026-01-01"), freq: "weekly", interval: 2, byWeekday: ["MO", "WE"] }));
