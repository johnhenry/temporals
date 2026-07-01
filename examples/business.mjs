// temporals/business — working days, holidays, working hours, business duration.
//   node examples/business.mjs
import "temporal-polyfill/global";
import { Interval, IntervalSet } from "temporals";
import {
  BusinessCalendar, usFederalHolidays, easterHoliday,
  WorkingHours, businessDuration, meetingSlots,
} from "temporals/business";
import { humanizeDuration } from "temporals/humanize";

const D = (s) => Temporal.PlainDate.from(s);
const Z = (s) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);

const cal = new BusinessCalendar({ holidays: usFederalHolidays() });
console.log("Is 2026-01-01 a business day?", cal.isBusinessDay(D("2026-01-01"))); // false (New Year)
console.log("Add 5 business days to 2026-01-02:", cal.addBusinessDays(D("2026-01-02"), 5).toString());
console.log("Business days in Jan 2026:", cal.businessDaysBetween(D("2026-01-01"), D("2026-02-01")));
console.log("Last business day of Jan:", cal.nthBusinessDay(2026, 1, -1)?.toString());
console.log("Easter 2026 / Good Friday:", easterHoliday()(2026)?.toString(), "/", easterHoliday(-2)(2026)?.toString());

// Working hours + business duration (skips weekends/holidays/off-hours).
const hours = new WorkingHours({ windows: [["09:00", "17:00"]], calendar: cal });
console.log("Working time Fri 15:00 → Mon 11:00:", humanizeDuration(businessDuration(Z("2026-01-02T15:00"), Z("2026-01-05T11:00"), hours)));

// Overnight shift.
const nights = new WorkingHours({ windows: [["22:00", "06:00"]] });
console.log("Open at 02:00 (overnight)?", nights.isOpen(Z("2026-01-06T02:00")));

// Mutual availability across two people.
const within = new Interval(Z("2026-01-05T00:00"), Z("2026-01-06T00:00"));
const alice = { hours, busy: IntervalSet.from([new Interval(Z("2026-01-05T10:00"), Z("2026-01-05T12:00"))]) };
const bob = { hours, busy: IntervalSet.from([new Interval(Z("2026-01-05T14:00"), Z("2026-01-05T15:00"))]) };
console.log("Meeting slots ≥ 90m:");
for (const s of meetingSlots({ participants: [alice, bob], within, duration: { minutes: 90 } })) {
  console.log("  ", s.start.toPlainTime().toString().slice(0, 5), "–", s.end.toPlainTime().toString().slice(0, 5));
}
