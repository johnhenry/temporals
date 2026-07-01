import type { Temporal } from "temporal-polyfill";

/**
 * Any ordered Temporal point that this library can build sequences from.
 * (PlainMonthDay is intentionally excluded — it has no defined ordering.)
 */
export type TemporalPoint =
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime
  | Temporal.PlainYearMonth
  | Temporal.PlainTime
  | Temporal.Instant;

/** A `Temporal.Duration` or any duration-like object accepted by `.add()`. */
export type DurationLike = Temporal.Duration | Temporal.DurationLike;

/** Overflow behaviour forwarded to Temporal arithmetic for calendar types. */
export type Overflow = "constrain" | "reject";

/** iCalendar weekday codes (RFC 5545). */
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** A weekday, optionally constrained to the nth occurrence (e.g. `2TU`, `-1FR`). */
export type WeekdaySpec = Weekday | { weekday: Weekday; nth?: number };

/** Recurrence frequency (RFC 5545 FREQ). */
export type Frequency =
  | "yearly"
  | "monthly"
  | "weekly"
  | "daily"
  | "hourly"
  | "minutely"
  | "secondly";
