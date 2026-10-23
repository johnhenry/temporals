// The panes of @johnhenry/temporals-viaframe. scripts/build.mjs turns each into a function canvas
// (panes/<id>.viaframe.json: one input pane per parameter, and one eval pane, `result`, whose named
// outputs are the pane's outputs), appends the bundled library to its code, and runs `viaframe pkg pack`.
// The titles, descriptions and icons are in ../viaframe-package.yaml.
//
// In `code`, `T` is the library (src/lib.ts): the parts of @johnhenry/temporals the panes use, plus the
// adapter that reads a pane's parameters. Every output is plain data.

const SCHEDULE = { group: "Schedule" };
const WINDOWS_HELP = 'Working windows as [open, close] wall-clock times, read in `zone`. A window that ends before it starts crosses midnight (["22:00", "06:00"]).';
const WEEKEND_HELP = "The days that are never working days: MO TU WE TH FR SA SU (or 1-7, 1 is Monday).";
const HOLIDAYS_HELP = "Days off: us-federal (the 11 US federal holidays, weekend-observed), easter, good-friday, easter-monday, a date (2026-12-24), a month and day every year (12-25), or { month, day, observed }, { month, weekday, nth } ({ month: 11, weekday: \"TH\", nth: 4 }), { easter: offset }.";

const scheduleInputs = (holidays = ["us-federal"]) => [
  { name: "zone", kind: "text", value: "America/New_York", control: { ...SCHEDULE, help: "The IANA time zone the working hours are read in." } },
  { name: "windows", kind: "json", valueType: "array", value: [["09:00", "17:00"]], control: { ...SCHEDULE, help: WINDOWS_HELP } },
  { name: "weekend", kind: "json", valueType: "array", value: ["SA", "SU"], control: { ...SCHEDULE, help: WEEKEND_HELP, advanced: true } },
  { name: "holidays", kind: "json", valueType: "array", value: holidays, control: { ...SCHEDULE, help: HOLIDAYS_HELP } },
];

// The test inputs of a plain UTC Monday-to-Friday, 09:00 to 17:00.
const UTC_9_5 = { zone: "UTC", windows: [["09:00", "17:00"]], weekend: ["SA", "SU"], holidays: [] };

export const PANES = [
  {
    id: "working-hours",
    inputs: [
      { name: "at", kind: "text", value: "2026-11-26T15:00:00Z", control: { group: "When", help: 'An ISO time with an offset or Z, one with a [zone], a wall-clock time read in `zone` (2026-11-26T10:00), or "now".' } },
      ...scheduleInputs(),
    ],
    outputs: ["open", "closesAt", "nextOpen", "wait", "waitWords", "summary"],
    code: `const hours = T.workingHours({ windows, weekend, holidays });
const now = String(at).trim().toLowerCase() === "now" ? T.Temporal().Now.zonedDateTimeISO(zone || "UTC") : T.zoned(at, zone);
const open = hours.isOpen(now);
// While open, the stretch it is in ends at closesAt; while closed, nextOpen is the next opening (within a year).
const stretch = open ? hours.intervalsBetween(now, now.add({ days: 2 })).intervals[0] : undefined;
const next = open ? now : hours.nextOpen(now);
const wait = next ? next.epochMilliseconds - now.epochMilliseconds : null;
const waitWords = wait === null ? null : T.words(wait, { max: 2 });
const day = (z) => z.toPlainDate().toLocaleString("en-US", { weekday: "short" }) + " " + z.toPlainDate().toString() + " " + z.toPlainTime().toString({ smallestUnit: "minute" });
return {
  open,
  closesAt: stretch ? T.iso(stretch.end) : null,
  nextOpen: next ? T.iso(next) : null,
  wait,
  waitWords,
  summary: open
    ? "open until " + day(stretch.end) + " (" + T.words(stretch.end.epochMilliseconds - now.epochMilliseconds, { max: 2 }) + " left)"
    : next ? "closed; opens " + day(next) + " (in " + waitWords + ")" : "closed, and not open within a year",
};`,
    tests: [
      { name: "open on a weekday afternoon, until five", inputs: { at: "2026-10-21T15:30:00Z", ...UTC_9_5 }, expect: { "result.open": true, "result.closesAt": "2026-10-21T17:00:00+00:00[UTC]", "result.wait": 0, "result.summary": "open until Wed 2026-10-21 17:00 (1 hour, 30 minutes left)" } },
      { name: "closed on Friday evening: opens Monday at nine", inputs: { at: "2026-10-23T18:00:00Z", ...UTC_9_5 }, expect: { "result.open": false, "result.closesAt": null, "result.nextOpen": "2026-10-26T09:00:00+00:00[UTC]", "result.wait": 226800000, "result.waitWords": "2 days, 15 hours" } },
      { name: "Thanksgiving is a US federal holiday: closed until Friday, in New York time", inputs: { at: "2026-11-26T15:00:00Z", zone: "America/New_York", windows: [["09:00", "17:00"]], weekend: ["SA", "SU"], holidays: ["us-federal"] }, expect: { "result.open": false, "result.nextOpen": "2026-11-27T09:00:00-05:00[America/New_York]", "result.summary": "closed; opens Fri 2026-11-27 09:00 (in 23 hours)" } },
      { name: "an overnight window crosses midnight", inputs: { at: "2026-10-21T02:00:00Z", zone: "UTC", windows: [["22:00", "06:00"]], weekend: [], holidays: [] }, expect: { "result.open": true, "result.closesAt": "2026-10-21T06:00:00+00:00[UTC]" } },
    ],
  },
  {
    id: "business-time",
    inputs: [
      { name: "start", kind: "text", value: "2026-12-23T15:00:00-05:00", control: { group: "Between", help: "An ISO time with an offset or Z, one with a [zone], or a wall-clock time read in `zone`." } },
      { name: "end", kind: "text", value: "2026-12-29T11:00:00-05:00", control: { group: "Between" } },
      ...scheduleInputs(),
    ],
    outputs: ["ms", "hours", "words", "businessDays", "summary"],
    code: `const hours = T.workingHours({ windows, weekend, holidays });
const from = T.zoned(start, zone);
const to = T.zoned(end, zone);
if (T.Temporal().ZonedDateTime.compare(from, to) > 0) throw new RangeError("start is after end");
const ms = T.durationMs(T.businessDuration(from, to, hours));
const calendar = T.businessCalendar({ weekend, holidays });
// Working days whose date is in [start's date, end's date].
const businessDays = calendar.businessDaysBetween(from.toPlainDate(), to.toPlainDate().add({ days: 1 }));
const words = T.words(ms, { largestUnit: "hour" });
return { ms, hours: ms / 3600000, words, businessDays, summary: words + " of working time over " + businessDays + " working day" + (businessDays === 1 ? "" : "s") };`,
    tests: [
      { name: "Friday afternoon to Monday morning skips the weekend", inputs: { start: "2026-10-23T15:00:00Z", end: "2026-10-26T11:00:00Z", ...UTC_9_5 }, expect: { "result.ms": 14400000, "result.hours": 4, "result.words": "4 hours", "result.businessDays": 2 } },
      { name: "Christmas Day is a holiday", inputs: { start: "2026-12-24T09:00:00Z", end: "2026-12-26T00:00:00Z", zone: "UTC", windows: [["09:00", "17:00"]], weekend: ["SA", "SU"], holidays: ["12-25"] }, expect: { "result.hours": 8, "result.businessDays": 1, "result.summary": "8 hours of working time over 1 working day" } },
      { name: "two windows a day, with a lunch break", inputs: { start: "2026-10-21T08:00:00Z", end: "2026-10-21T18:00:00Z", zone: "UTC", windows: [["09:00", "12:00"], ["13:00", "17:30"]], weekend: ["SA", "SU"], holidays: [] }, expect: { "result.words": "7 hours, 30 minutes" } },
    ],
  },
  {
    id: "add-business-days",
    inputs: [
      { name: "date", kind: "text", value: "2026-12-23", control: { group: "When", help: "A date (2026-12-23), or a time whose date in `zone` is meant." } },
      { name: "days", kind: "number", value: 3, control: { group: "When", help: "Working days to move: negative goes back." } },
      { name: "zone", kind: "text", value: "America/New_York", control: { group: "When", help: "Only for a time given as `date`: the zone its date is read in.", advanced: true } },
      { name: "weekend", kind: "json", valueType: "array", value: ["SA", "SU"], control: { ...SCHEDULE, help: WEEKEND_HELP } },
      { name: "holidays", kind: "json", valueType: "array", value: ["us-federal"], control: { ...SCHEDULE, help: HOLIDAYS_HELP } },
    ],
    outputs: ["date", "weekday", "daysOff", "summary"],
    code: `const calendar = T.businessCalendar({ weekend, holidays });
const from = T.plainDate(date, zone);
const n = Math.trunc(Number(days) || 0);
const to = calendar.addBusinessDays(from, n);
// The days in between that weren't working days (weekends and holidays), in order. (Not named
// \`skipped\`: pane code has skip, skipped, firstOf, env and requireEnv in its own scope.)
const daysOff = [];
const step = n >= 0 ? 1 : -1;
for (let d = from.add({ days: step }); T.Temporal().PlainDate.compare(d, to) * step < 0; d = d.add({ days: step })) if (!calendar.isBusinessDay(d)) daysOff.push(d.toString());
const weekday = to.toLocaleString("en-US", { weekday: "long" });
return { date: to.toString(), weekday, daysOff, summary: n + " working day" + (Math.abs(n) === 1 ? "" : "s") + " from " + from.toString() + " is " + weekday + " " + to.toString() + (daysOff.length ? " (skipping " + daysOff.length + " day" + (daysOff.length === 1 ? "" : "s") + " off)" : "") };`,
    tests: [
      { name: "over Christmas with the US federal holidays", inputs: { date: "2026-12-23", days: 3, weekend: ["SA", "SU"], holidays: ["us-federal"] }, expect: { "result.date": "2026-12-29", "result.weekday": "Tuesday", "result.daysOff": ["2026-12-25", "2026-12-26", "2026-12-27"] } },
      { name: "backwards over a weekend", inputs: { date: "2026-10-26", days: -1, weekend: ["SA", "SU"], holidays: [] }, expect: { "result.date": "2026-10-23", "result.daysOff": ["2026-10-25", "2026-10-24"] } },
      { name: "a Friday-Saturday weekend", inputs: { date: "2026-10-22", days: 1, weekend: ["FR", "SA"], holidays: [] }, expect: { "result.date": "2026-10-25", "result.weekday": "Sunday" } },
    ],
  },
  {
    id: "duration-words",
    inputs: [
      { name: "duration", kind: "text", value: "93784000", control: { group: "Duration", help: 'Milliseconds (93784000), an ISO 8601 duration (PT1H30M, P2W) or shorthand (1h 30m, 2d 12h).' } },
      { name: "maxUnits", kind: "number", value: 0, control: { group: "Words", help: "Keep only this many of the largest units; 0 keeps every one." } },
      { name: "short", kind: "checkbox", value: false, control: { group: "Words", help: "1h 30m instead of 1 hour, 30 minutes." } },
      { name: "precision", kind: "select", value: "second", options: "second,millisecond", control: { group: "Words", help: "The smallest unit shown." } },
      { name: "locale", kind: "text", value: "", control: { group: "Words", help: "A locale (fr, de-CH) for localized words where the runtime has Intl.DurationFormat; empty is English.", advanced: true } },
    ],
    outputs: ["text", "iso", "ms"],
    code: `const d = T.duration(duration);
const calendarUnits = Boolean(d.years || d.months || d.weeks);
const max = Number(maxUnits) > 0 ? Math.trunc(Number(maxUnits)) : undefined;
const text = T.words(duration, { max, short: Boolean(short), precision: precision || "second", locale: locale ? String(locale) : undefined });
// Years, months and weeks have no fixed length, so a duration with them has no milliseconds.
return { text, iso: d.toString(), ms: calendarUnits ? null : T.durationMs(d) };`,
    tests: [
      { name: "milliseconds as days down to seconds", inputs: { duration: "93784000" }, expect: { "result.text": "1 day, 2 hours, 3 minutes, 4 seconds", "result.iso": "P1DT2H3M4S", "result.ms": 93784000 } },
      { name: "shorthand, the two largest units, short", inputs: { duration: "2d 12h 30m", maxUnits: 2, short: true }, expect: { "result.text": "2d 12h", "result.ms": 217800000 } },
      { name: "an ISO duration with weeks has no milliseconds", inputs: { duration: "P2W3D" }, expect: { "result.text": "2 weeks, 3 days", "result.ms": null } },
      { name: "sub-second parts with millisecond precision", inputs: { duration: "1500", precision: "millisecond" }, expect: { "result.text": "1 second, 500 milliseconds" } },
    ],
  },
  {
    id: "relative-time",
    inputs: [
      { name: "from", kind: "text", value: "2026-10-23T09:00:00Z", control: { group: "Times", help: 'The time it is said from: ISO with an offset or Z, with a [zone], a wall-clock time read in `zone`, or "now".' } },
      { name: "to", kind: "text", value: "2026-10-25T15:00:00Z", control: { group: "Times" } },
      { name: "zone", kind: "text", value: "UTC", control: { group: "Times", help: "Calendar days (tomorrow, in 2 days) are counted in this zone." } },
      { name: "locale", kind: "text", value: "en", control: { group: "Words" } },
      { name: "numeric", kind: "select", value: "auto", options: "auto,always", control: { group: "Words", help: "auto says tomorrow and yesterday; always says in 1 day." } },
    ],
    outputs: ["text", "between"],
    code: `const read = (t) => String(t).trim().toLowerCase() === "now" ? T.Temporal().Now.zonedDateTimeISO(zone || "UTC") : T.zoned(t, zone);
const a = read(from);
const b = read(to);
const text = T.formatRelative(a, b, { locale: locale ? String(locale) : undefined, numeric: numeric === "always" ? "always" : "auto" });
return { text, between: T.words(b.epochMilliseconds - a.epochMilliseconds, { max: 2 }) };`,
    tests: [
      { name: "two calendar days ahead", inputs: { from: "2026-10-23T09:00:00Z", to: "2026-10-25T15:00:00Z", zone: "UTC", locale: "en" }, expect: { "result.text": "in 2 days", "result.between": "2 days, 6 hours" } },
      { name: "less than a day on is said in hours, even past midnight", inputs: { from: "2026-10-23T22:00:00Z", to: "2026-10-24T01:00:00Z", zone: "UTC", locale: "en" }, expect: { "result.text": "in 3 hours" } },
      { name: "numeric always, in the past", inputs: { from: "2026-10-23T09:00:00Z", to: "2026-10-22T09:00:00Z", zone: "UTC", locale: "en", numeric: "always" }, expect: { "result.text": "1 day ago" } },
      { name: "26 hours on is tomorrow in UTC", inputs: { from: "2026-10-23T06:00:00Z", to: "2026-10-24T08:00:00Z", zone: "UTC", locale: "en" }, expect: { "result.text": "tomorrow", "result.between": "1 day, 2 hours" } },
      { name: "the same 26 hours span two calendar days in Los Angeles", inputs: { from: "2026-10-23T06:00:00Z", to: "2026-10-24T08:00:00Z", zone: "America/Los_Angeles", locale: "en" }, expect: { "result.text": "in 2 days" } },
    ],
  },
  {
    id: "recurrence",
    inputs: [
      { name: "rule", kind: "text", value: "FREQ=WEEKLY;BYDAY=MO,WE", control: { group: "Rule", help: "An RFC 5545 RRULE (FREQ=MONTHLY;BYDAY=2TU, FREQ=DAILY;INTERVAL=3, …), with or without RRULE:." } },
      { name: "start", kind: "text", value: "2026-10-19T09:00", control: { group: "Rule", help: "The first time (DTSTART): a wall-clock time read in `zone`, or an ISO time with an offset, Z or [zone]." } },
      { name: "zone", kind: "text", value: "Europe/Paris", control: { group: "Rule", help: "The zone the rule repeats in: the wall-clock time stays put across daylight saving changes." } },
      { name: "count", kind: "number", value: 5, control: { group: "List", help: "How many times to list (1 to 500)." } },
      { name: "after", kind: "text", value: "", control: { group: "List", help: "List only the times at or after this one; empty lists from the start.", advanced: true } },
    ],
    outputs: ["times", "utc", "next", "summary"],
    code: `const first = T.zoned(start, zone);
const n = Math.max(1, Math.min(500, Math.trunc(Number(count) || 1)));
const from = String(after ?? "").trim() ? T.zoned(after, zone) : null;
let seq = T.recurFromString(String(rule), first);
if (from) seq = seq.filter((z) => T.Temporal().ZonedDateTime.compare(z, from) >= 0);
const list = seq.take(n).toArray();
const times = list.map(T.iso);
const utc = list.map((z) => z.toInstant().toString());
return { times, utc, next: times[0] ?? null, summary: list.length ? list.length + " time" + (list.length === 1 ? "" : "s") + " from " + times[0] : "no times" };`,
    tests: [
      { name: "Monday and Wednesday at nine in Paris keep the wall clock across the change to winter time", inputs: { rule: "FREQ=WEEKLY;BYDAY=MO,WE", start: "2026-10-19T09:00", zone: "Europe/Paris", count: 4 }, expect: { "result.times": ["2026-10-19T09:00:00+02:00[Europe/Paris]", "2026-10-21T09:00:00+02:00[Europe/Paris]", "2026-10-26T09:00:00+01:00[Europe/Paris]", "2026-10-28T09:00:00+01:00[Europe/Paris]"], "result.utc": ["2026-10-19T07:00:00Z", "2026-10-21T07:00:00Z", "2026-10-26T08:00:00Z", "2026-10-28T08:00:00Z"] } },
      { name: "the second Tuesday of each month", inputs: { rule: "RRULE:FREQ=MONTHLY;BYDAY=2TU", start: "2026-01-13T10:00:00Z", zone: "UTC", count: 3 }, expect: { "result.times": ["2026-01-13T10:00:00+00:00[UTC]", "2026-02-10T10:00:00+00:00[UTC]", "2026-03-10T10:00:00+00:00[UTC]"] } },
      { name: "only the times after a moment, and COUNT ends the rule", inputs: { rule: "FREQ=DAILY;COUNT=5", start: "2026-10-19T12:00:00Z", zone: "UTC", count: 10, after: "2026-10-21T00:00:00Z" }, expect: { "result.next": "2026-10-21T12:00:00+00:00[UTC]", "result.summary": "3 times from 2026-10-21T12:00:00+00:00[UTC]" } },
    ],
  },
];
