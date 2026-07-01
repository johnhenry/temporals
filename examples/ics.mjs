// temporals/ics — iCalendar import/export round-trip.
//   node examples/ics.mjs
import "temporal-polyfill/global";
import { toICS, fromICS, icsToSeq } from "temporals/ics";

const D = (s) => Temporal.PlainDate.from(s);

// Export an all-day weekly event with an RRULE, an EXDATE and an RDATE.
const ics = toICS([
  {
    uid: "standup@temporals",
    summary: "Standup",
    start: D("2026-01-01"),
    rrule: "FREQ=WEEKLY;COUNT=4",
    exdate: [D("2026-01-08")],
    rdate: [D("2026-01-03")],
  },
]);
console.log("--- .ics ---\n" + ics + "\n");

// Re-import and expand.
const [event] = fromICS(ics);
console.log("parsed start:", event.start.toString(), "| rrule:", event.rrule);
console.log("occurrences:", icsToSeq(event).toArray().map(String).join(", "));
