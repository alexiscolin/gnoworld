// A translation's check (ADR-0002 §5, point 5): one that adds a link, an account or a number its original lacks, or names
// the whole room where its original does not, is dropped and the original shows. Both are read by facts.ts, as grounding
// reads a digest.
import { factsOf } from "./facts.ts";

const within = (some: ReadonlySet<string>, all: ReadonlySet<string>): boolean =>
  [...some].every((value) => all.has(value));

/** Whether `translation` keeps to `original`: it adds no link, no account, no `@room` and no number. */
export function keeps(original: string, translation: string): boolean {
  const before = factsOf(original);
  const after = factsOf(translation);
  return (
    within(after.links, before.links) &&
    within(after.addresses, before.addresses) &&
    within(after.numbers, before.numbers) &&
    (before.room || !after.room)
  );
}
