// Free/busy availability — the payoff of composing Schedule + IntervalSet +
// business hours.  Run:  node examples/availability.mjs
import "temporal-polyfill/global";
import { Interval, IntervalSet } from "temporals";
import { WorkingHours, BusinessCalendar, Holidays, fixedHoliday } from "temporals/business";
import { humanizeDuration } from "temporals/humanize";

const TZ = "America/New_York";
const Z = (s) => Temporal.ZonedDateTime.from(`${s}[${TZ}]`);

// 1. WHEN we *could* meet: Mon–Fri 09:00–17:00, minus holidays.
const cal = new BusinessCalendar({ holidays: Holidays.of(fixedHoliday(1, 1, { observed: true })) });
const hours = new WorkingHours({ windows: [["09:00", "17:00"]], calendar: cal });
const week = hours.intervalsBetween(Z("2026-01-05T00:00"), Z("2026-01-10T00:00")); // that work-week

// 2. WHEN we're busy (meetings — could equally come from a cron/RRULE Schedule).
const busy = IntervalSet.from([
  new Interval(Z("2026-01-05T10:00"), Z("2026-01-05T11:30")),
  new Interval(Z("2026-01-06T09:00"), Z("2026-01-06T12:00")),
  new Interval(Z("2026-01-08T14:00"), Z("2026-01-08T17:00")),
]);

// 3. FREE = working time − busy time.
const free = week.difference(busy);

console.log(`Total free this week: ${humanizeDuration(free.totalDuration())}\n`);
console.log("Open slots:");
for (const slot of free) {
  const day = slot.start.toPlainDate().toString();
  const from = slot.start.toPlainTime().toString().slice(0, 5);
  const to = slot.end.toPlainTime().toString().slice(0, 5);
  console.log(`  ${day}  ${from}–${to}`);
}
