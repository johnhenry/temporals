// A quick tour across the whole library. For per-feature depth, see the other
// examples in this folder (range, recur, cron, intervals, business, humanize,
// backoff, ics).
//   node examples/basic.mjs
import "temporal-polyfill/global";
import { range, recur, Schedule, Interval, IntervalSet, startOf } from "temporals";
import { cron, describeCron } from "temporals/cron";
import { usFederalHolidays, BusinessCalendar } from "temporals/business";
import { humanizeDuration } from "temporals/humanize";

const D = (s) => Temporal.PlainDate.from(s);
const TZ = "America/New_York";
const line = (label, v) => console.log(label.padEnd(26), v);

// range → lazy Seq with iterator helpers
line("next 3 weekdays:", range({ start: D("2026-01-01"), step: { days: 1 } }).filter((d) => d.dayOfWeek <= 5).take(3).toArray().map(String).join(", "));

// recur → RRULE
line("2nd Tuesday, 3×:", recur({ start: D("2026-01-01"), freq: "monthly", byWeekday: [{ weekday: "TU", nth: 2 }], count: 3 }).toArray().map(String).join(", "));

// cron → DST-correct fire times
line("cron 9am weekdays:", cron("0 9 * * 1-5", { timeZone: TZ }).take(2).toArray().map((z) => z.toPlainDate().toString()).join(", "));
line("describeCron:", describeCron("0 9 * * 1-5"));

// Schedule → unified "when"
line("Schedule.rule.next:", Schedule.rule({ start: D("2026-01-01"), freq: "weekly" }).next(D("2026-01-01")).toString());

// intervals + set algebra
const free = IntervalSet.from([new Interval(D("2026-01-01"), D("2026-01-06"))]).difference(IntervalSet.from([new Interval(D("2026-01-02"), D("2026-01-03"))]));
line("free = work − busy:", free.intervals.map((i) => i.toString()).join(", "));

// business
const cal = new BusinessCalendar({ holidays: usFederalHolidays() });
line("business days in Jan:", cal.businessDaysBetween(D("2026-01-01"), D("2026-02-01")));

// humanize + calendar
line("humanize:", humanizeDuration(Temporal.Duration.from({ hours: 2, minutes: 3 })));
line("startOf week:", startOf(D("2026-01-01"), "week").toString());
