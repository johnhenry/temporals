// Interval algebra + IntervalSet (union / intersection / difference / gaps).
//   node examples/intervals.mjs
import "temporal-polyfill/global";
import { Interval, IntervalSet } from "temporals";

const D = (n) => Temporal.PlainDate.from(`2026-01-0${n}`);
const iv = (a, b) => new Interval(D(a), D(b));
const show = (label, set) => console.log(label, set.intervals.map((i) => i.toString()).join(", "));

// Allen relations.
console.log("[1,3) relation [3,5):", iv(1, 3).relation(iv(3, 5))); // meets
console.log("[1,5) relation [2,3):", iv(1, 5).relation(iv(2, 3))); // contains
console.log("[1,3) relation [2,5):", iv(1, 3).relation(iv(2, 5))); // overlaps

// Interval ops.
console.log("[1,5) ∩ [3,8):", iv(1, 5).intersection(iv(3, 8))?.toString());
console.log("[1,3) contains 2026-01-02:", iv(1, 3).contains(D(2)));

// Set operations.
const a = IntervalSet.from([iv(1, 5), iv(6, 8)]);
const b = IntervalSet.from([iv(2, 7)]);
show("union:", a.union(b));
show("intersection:", a.intersection(b));
show("difference (a − b):", a.difference(b));
show("gaps within [1,9):", a.gaps(iv(1, 9)));

// Availability: free = work − busy.
const work = IntervalSet.from([iv(1, 6)]);
const busy = IntervalSet.from([iv(2, 3), iv(4, 5)]);
show("free = work − busy:", work.difference(busy));
