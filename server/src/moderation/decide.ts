// What a provider's answer means for a message (ADR-0002 §6): hide on OpenAI's own flag for a category,
// or on a score at the threshold a setting gives it instead; always on anything involving minors. The
// reason named is the hidden category with the highest score. Pure: the record keeps what it used.
import { CATEGORIES, type Answer, type Category } from "./provider.ts";

export type Thresholds = Partial<Record<Category, number>>;
export type Decision = { action: "hide"; reason: Category } | { action: "pass" };

export function decide({ flagged, scores }: Answer, thresholds: Thresholds): Decision {
  const minors: Category = "sexual/minors";
  const over = (category: Category): boolean => {
    const threshold = thresholds[category];
    const crossed = threshold === undefined ? flagged[category] : scores[category] >= threshold;
    return crossed || (category === minors && flagged[minors]);
  };
  if (over(minors)) return { action: "hide", reason: minors };
  const hidden = CATEGORIES.filter(over).toSorted((a, b) => scores[b] - scores[a]);
  const [reason] = hidden;
  return reason === undefined ? { action: "pass" } : { action: "hide", reason };
}
