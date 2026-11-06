// A UTC day as the device keeps it (slice 8): the date part of ISO 8601, "2026-11-04". A stamp, a streak and the expedition count by it,
// so a person's clock and time zone never split or join two days.
import { z } from "./zod.ts";

export const Day = z.string().check(z.regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/));
