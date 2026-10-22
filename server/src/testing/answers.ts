// OpenAI's moderation answer as the tests build it: every category unflagged and at 0, but those given.
import { CATEGORIES, type Answer, type Category } from "../moderation/provider.ts";

export const answer = (
  flags: Partial<Record<Category, boolean>> = {},
  scores: Partial<Record<Category, number>> = {},
): Answer => ({
  flagged: Object.fromEntries(CATEGORIES.map((c) => [c, flags[c] ?? false])) as Record<Category, boolean>,
  scores: Object.fromEntries(CATEGORIES.map((c) => [c, scores[c] ?? 0])) as Record<Category, number>,
});
