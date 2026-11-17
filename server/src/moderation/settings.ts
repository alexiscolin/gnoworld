// The moderation's settings: OpenAI's key, the scores that hide a category in its flag's place, how long an account is new,
// and the mutes. config.ts takes them in its schema.
import { jsonOf } from "@gnoworld/core";
import { whole } from "@gnoworld/service/settings";
import { z } from "zod";
import { CATEGORIES } from "./provider.ts";

export const moderationSettings = () => ({
  // Any text at all: only `on` switches OpenAI's moderation on and reads its key; off by default.
  MODERATION: z.string().optional(),
  OPENAI_API_KEY_FILE: z.string().min(1).optional(),
  // A score that hides a category in place of OpenAI's own flag, by category: {"harassment": 0.9}.
  MODERATION_THRESHOLDS: z
    .string()
    .transform((text, ctx) => {
      const value = jsonOf(text);
      if (value !== undefined) return value;
      ctx.addIssue({ code: "custom", message: "json" });
      return z.NEVER;
    })
    .pipe(
      z.strictObject(Object.fromEntries(CATEGORIES.map((category) => [category, z.number().gt(0).max(1).optional()]))),
    )
    .default({}),
  NEW_ACCOUNT_HOURS: whole(720, 24),
  MUTE_STRIKES: whole(99, 3),
  MUTE_WINDOW_MINUTES: whole(1440, 10),
  MUTE_MINUTES: whole(10_080, 5),
  // Ergo's ban list holds 100 a room: the mutes leave the moderators their share of it.
  MUTE_MAX: whole(100, 50),
});
