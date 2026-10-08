# Changelog

## 0.1.0 — 2026-10-08

- New: `isoWeekOf(point)` returns `{ year, week }` (ISO week number and week-year).
- New: `dstSavingsNanoseconds(zdt)` exposes the raw DST shift `isDST` is derived
  from, so callers can apply their own definition (e.g. Europe/Dublin).
- Behaviour: `quarterOf` / `fiscalQuarterOf` / `fiscalYearOf` now throw
  `RangeError` for calendars/years without 12 months (e.g. Hebrew leap years)
  instead of silently returning a wrong quarter.
- Docs: Scope & limitations now states the 12-month and ISO-week assumptions and
  that conflict resolution is deliberately out of scope.

## 0.0.3 — 2026-10-07

- Release of the changes below. (A `v0.0.2` git tag from July already pointed at an
  unpublished commit, so this release is numbered 0.0.3; 0.0.2 was never on npm.)

## 0.0.2 — 2026-10-06

- Fix: `describeCron` ignored the seconds field of 6-field expressions in most
  cases (`*/3 * * * * *` and `0,30 * * * * *` both read "every minute"). The
  seconds field is now described in every branch: `every second`,
  `every 3 seconds`, `at seconds 0, 30`, `every second from 10 through 20`,
  `at second 30 of every minute`, and combined with minute/hour phrasing
  (`every 10 seconds, at 09:00`; the single-value fixed-time form `at 09:00:15`
  is unchanged). 5-field output is byte-identical.
- CI/release: run on Node 26 only (matches `engines.node >=26`); release,
  coverage jobs moved from Node 22 to 26.

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
