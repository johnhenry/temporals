# Changelog

## 0.0.1 — 2026-09-27

- Fix: `ruleFromString` truncated the last character of the offending part's
  name in its "unsupported RRULE part" error whenever that part had no `=`
  (e.g. `BOGUS` was reported as `BOGU`) — `part.slice(0, eq)` silently became
  `part.slice(0, -1)` when `eq` (from `indexOf("=")`) was `-1`.
- Fix: `ruleFromString` threw a raw, context-free `TypeError` (from `kindOf`)
  when parsing `UNTIL` with no `DTSTART` provided (e.g. via `icsToSeq` on an
  ICS `VEVENT` whose `RRULE` has `UNTIL` but no `DTSTART` line). Now throws a
  `RangeError` naming the actual problem, matching this file's other
  RRULE-parsing errors.
- Docs: link the guided documentation section at
  https://opensource.johnhenry.me/temporals/ from the README.
- Examples: import the package by its scoped name `@johnhenry/temporals`
  (the unscoped `temporals` specifiers were stale after the rename and broke
  `npm run examples`).
- Fix `test:example` for current Node: point `node --test` at
  `examples/scheduler/test.mjs` (Node 26 no longer accepts the bare directory).

## 0.0.0 — 2026-08-23

Adopted into the @johnhenry family. Previously published as `temporals`
(unscoped; last release `temporals@0.0.2`, now deprecated). Renamed to
`@johnhenry/temporals` and restarted at 0.0.0 — a new address and era, not a
maturity signal. Same library, same API.
