// What an admin reads and signs of Jarvis (ADR-0002 §6): a quota, an account's quota taken off or given back, a budget, and what the admin
// API answers: the quotas, the allowlist and the budgets with what each spent and reserved today.
import { Address } from "./address.ts";
import { DOOR_CAPS } from "./jarvis.ts";
import { ChallengeRequest } from "./login.ts";
import { z } from "./zod.ts";

const count = (max: number) => z.int().check(z.gte(1), z.lte(max));

/** One of jarvis's two budgets a day, in whole dollars, as its settings take them. */
export const JarvisBudget = z.strictObject({ budget: z.enum(["ask", "translate"]), dollars: count(DOOR_CAPS.dollars) });
export type JarvisBudget = z.infer<typeof JarvisBudget>;

// What a budget has spent or has reserved today, in dollars: a fraction of one, and past its cap when a call cost more.
const Used = z.strictObject({ ask: z.number().check(z.gte(0)), translate: z.number().check(z.gte(0)) });

const Dollars = count(DOOR_CAPS.dollars);
/** Both of jarvis's budgets a day, in whole dollars, and what each has spent and has reserved today, in dollars. */
export const JarvisBudgets = z.strictObject({ ask: Dollars, translate: Dollars, spent: Used, reserved: Used });
export type JarvisBudgets = z.infer<typeof JarvisBudgets>;

/** One change an admin signs afresh (ADR-0002 §6): a quota, an account's quota taken off or given back, a budget. */
export const JarvisChange = z.discriminatedUnion("setting", [
  z.strictObject({ setting: z.literal("quota"), questions: count(DOOR_CAPS.quota) }),
  z.strictObject({ setting: z.literal("quota_unnamed"), questions: count(DOOR_CAPS.quota) }),
  z.strictObject({ setting: z.literal("unlimited"), account: Address, unlimited: z.boolean() }),
  z.extend(JarvisBudget, { setting: z.literal("budget") }),
]);
export type JarvisChange = z.infer<typeof JarvisChange>;

/** A change asked for on a chain, whose challenge the admin's wallet signs as a login's. */
export const JarvisChangeRequest = z.extend(ChallengeRequest, { change: JarvisChange });

/** What the admin API answers: the quotas, the accounts with no quota, and jarvis's budgets, or none when it did not
 * answer. */
export const JarvisSettings = z.strictObject({
  quota: count(DOOR_CAPS.quota),
  quotaUnnamed: count(DOOR_CAPS.quota),
  unlimited: z.array(Address).check(z.maxLength(DOOR_CAPS.unlimited)),
  budgets: z.nullable(JarvisBudgets),
});
export type JarvisSettings = z.infer<typeof JarvisSettings>;
