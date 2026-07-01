// range / chunks / windows / seq builder / calendar rounding.
//   node examples/range.mjs
import "temporal-polyfill/global";
import { range, chunks, windows, seq, startOf, endOf, quarterOf } from "temporals";

const D = (s) => Temporal.PlainDate.from(s);
const show = (label, it) => console.log(label, [...it].map(String).join(", "));

// Stepped ranges — bounded, counted, descending, infinite+lazy.
show("every day, half-open:", range({ start: D("2026-01-01"), end: D("2026-01-06"), step: { days: 1 } }));
show("every 2 days, count 3:", range({ start: D("2026-01-01"), count: 3, step: { days: 2 } }));
show("descending:", range({ start: D("2026-01-05"), end: D("2026-01-01"), step: { days: -1 } }));
show(
  "next 3 weekdays (infinite + filter + take):",
  range({ start: D("2026-01-01"), step: { days: 1 } }).filter((d) => d.dayOfWeek <= 5).take(3),
);

// Month-end does NOT drift (anchor-relative stepping).
show("month steps from Jan 31:", range({ start: D("2026-01-31"), count: 4, step: { months: 1 } }));

// Intervals: partition vs sliding.
show("weekly chunks:", chunks({ start: D("2026-01-01"), end: D("2026-01-22"), by: { weeks: 1 } }));
show(
  "7-day sliding windows / 3 days:",
  windows({ start: D("2026-01-01"), end: D("2026-01-15"), size: { days: 7 }, step: { days: 3 } }),
);

// Fluent builder + calendar rounding.
show("seq() builder:", seq(D("2026-01-01")).step({ days: 2 }).count(3));
console.log("startOf month:", startOf(D("2026-05-17"), "month").toString());
console.log("endOf quarter (exclusive):", endOf(D("2026-05-17"), "quarter").toString());
console.log("quarterOf 2026-05-17:", quarterOf(D("2026-05-17")));
