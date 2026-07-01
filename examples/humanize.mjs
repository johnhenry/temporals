// temporals/humanize — duration humanizing, relative time, parsing.
//   node examples/humanize.mjs
import "temporal-polyfill/global";
import { humanizeDuration, formatRelative, fromNow, parseDuration } from "temporals/humanize";

const D = (s) => Temporal.PlainDate.from(s);
const DT = (s) => Temporal.PlainDateTime.from(s);

console.log("humanize:", humanizeDuration(Temporal.Duration.from({ hours: 2, minutes: 3 })));
console.log("humanize short:", humanizeDuration(Temporal.Duration.from({ hours: 2, minutes: 3 }), { short: true }));
console.log("humanize max 1:", humanizeDuration(Temporal.Duration.from({ days: 1, hours: 6 }), { max: 1 }));
console.log("humanize (fr, if Intl.DurationFormat):", humanizeDuration(Temporal.Duration.from({ hours: 2 }), { locale: "fr" }));

console.log("parseDuration('1h30m'):", parseDuration("1h30m").toString());
console.log("parseDuration('2d 12h'):", parseDuration("2d 12h").toString());

console.log("formatRelative future:", formatRelative(D("2026-01-01"), D("2026-01-06")));
console.log("formatRelative past:", formatRelative(DT("2026-01-01T12:00"), DT("2026-01-01T10:00")));
console.log("fromNow(2030-01-01):", fromNow(D("2030-01-01")));
