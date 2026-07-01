// backoff (retry delays) + DST-transition helpers.
//   node examples/backoff.mjs
import "temporal-polyfill/global";
import { backoff, isDST, nextTransition, previousTransition, transitionsBetween } from "temporals";
import { humanizeDuration } from "temporals/humanize";

const ms = (seq) => [...seq].map((d) => d.milliseconds);

console.log("exponential (base 100, x2):", ms(backoff({ base: 100, attempts: 5 })));
console.log("capped at 500:", ms(backoff({ base: 100, max: 500, attempts: 5 })));
console.log("with equal jitter:", ms(backoff({ base: 100, attempts: 4, jitter: "equal", random: () => 0.5 })));
console.log("humanized first delay:", humanizeDuration(backoff({ base: { seconds: 30 }, attempts: 1 }).first(), { short: true }));

const Z = (s) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);
console.log("isDST July / January:", isDST(Z("2026-07-01T12:00")), "/", isDST(Z("2026-01-01T12:00")));
console.log("next transition:", nextTransition(Z("2026-01-15T12:00"))?.toString());
console.log("previous transition:", previousTransition(Z("2026-01-15T12:00"))?.toString());
console.log(
  "transitions in 2026:",
  transitionsBetween(Z("2026-01-01T00:00"), Z("2027-01-01T00:00")).map((t) => t.toPlainDate().toString()).join(", "),
);
