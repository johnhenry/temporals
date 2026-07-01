// Runnable smoke test against the built package.
//   node examples/basic.mjs
//
// On Node < 22 (no native Temporal) this installs the polyfill global; on
// Node 22+ the native Temporal is used and this import is a harmless no-op shim.
import "temporal-polyfill/global";
import { range, chunks, windows, recur, seq, recurBuilder, Interval } from "../dist/index.js";

const show = (label, it) => console.log(label, [...it].map(String).join(", "));

// 1. A stepped range — weekdays only, first 5, via native-style iterator helpers.
show(
  "next 5 weekdays:",
  range({ start: Temporal.Now.plainDateISO(), step: { days: 1 } })
    .filter((d) => d.dayOfWeek <= 5)
    .take(5),
);

// 2. Month-end that does NOT drift (anchor-relative stepping).
show(
  "month steps from Jan 31:",
  range({ start: Temporal.PlainDate.from("2026-01-31"), step: { months: 1 }, count: 4 }),
);

// 3. Partition a quarter into weeks (intervals).
show(
  "weekly chunks:",
  chunks({
    start: Temporal.PlainDate.from("2026-01-01"),
    end: Temporal.PlainDate.from("2026-02-01"),
    by: { weeks: 1 },
  }),
);

// 4. Sliding 7-day windows stepping by 2 days.
show(
  "sliding windows:",
  windows({
    start: Temporal.PlainDate.from("2026-01-01"),
    end: Temporal.PlainDate.from("2026-01-10"),
    size: { days: 7 },
    step: { days: 2 },
  }),
);

// 5. RRULE recurrence: the 2nd Tuesday of each month.
show(
  "2nd Tuesday monthly:",
  recur({
    start: Temporal.PlainDate.from("2026-01-01"),
    freq: "monthly",
    byWeekday: [{ weekday: "TU", nth: 2 }],
    count: 4,
  }),
);

// 6. DST-correct zoned stepping (wall-clock stays at 09:00 across the boundary).
show(
  "zoned daily across DST:",
  range({
    start: Temporal.ZonedDateTime.from("2026-03-07T09:00[America/New_York]"),
    step: { days: 1 },
    count: 3,
  }).map((z) => `${z.toPlainDate()} ${z.toPlainTime()} ${z.offset}`),
);

// 7. Fluent builders.
show(
  "seq() builder:",
  seq(Temporal.PlainDate.from("2026-01-01")).step({ days: 2 }).count(3),
);
console.log(
  "recurBuilder RRULE:",
  recurBuilder(Temporal.PlainDate.from("2026-01-01")).monthly().on({ weekday: "FR", nth: -1 }).count(3).toString(),
);

// 8. Interval value type.
const q1 = Interval.from("2026-01-01/2026-04-01");
console.log("interval:", q1.toString(), "| contains 2026-02-15:", q1.contains(Temporal.PlainDate.from("2026-02-15")));
