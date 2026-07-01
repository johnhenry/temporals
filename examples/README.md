# Examples

Runnable, self-contained programs — one per feature area. They import `temporals`
by name (like a consumer would), so build the package first:

```sh
npm run build
node examples/basic.mjs        # or any file below
npm run examples               # run them all (used in CI to prevent drift)
```

| File | Covers |
| --- | --- |
| [`basic.mjs`](basic.mjs) | A quick tour across the whole library |
| [`range.mjs`](range.mjs) | `range` / `chunks` / `windows`, the `seq()` builder, calendar rounding |
| [`recur.mjs`](recur.mjs) | RRULE recurrence, EXDATE/RDATE, DST policy, RRULE-string interop |
| [`cron.mjs`](cron.mjs) | Temporal-native cron, Quartz `L`/`#`, `describeCron`, converters |
| [`intervals.mjs`](intervals.mjs) | `Interval` + Allen relations, `IntervalSet` set algebra, free/busy |
| [`business.mjs`](business.mjs) | Business days, US/Easter holidays, working hours, `meetingSlots` |
| [`humanize.mjs`](humanize.mjs) | Duration humanizing, relative time, shorthand parsing |
| [`backoff.mjs`](backoff.mjs) | Retry backoff sequences + DST-transition helpers |
| [`ics.mjs`](ics.mjs) | iCalendar (`.ics`) import/export round-trip |
| [`availability.mjs`](availability.mjs) | Working hours − meetings = open slots |
| [`scheduler/`](scheduler) | A minimal reference scheduler (the *when* vs *do it* boundary) |
