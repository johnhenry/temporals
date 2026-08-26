# Changelog

## Unreleased

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
