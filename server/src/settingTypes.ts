// The two kinds of setting the server's environment names most (config.ts): a whole number and an absolute path.
import { z } from "zod";

// A whole number from 1 to `max`, written plainly: no sign, no leading zero, no point.
export const whole = (max: number, otherwise: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().max(max))
    .default(otherwise);

// An absolute path whose every part is a name (no "", "." or ".."), so never the root a walk would take whole (F636).
export const absolute = z.string().refine((path) => {
  const [root, ...parts] = path.split("/");
  return root === "" && parts.length > 0 && parts.every((part) => !["", ".", ".."].includes(part));
});
