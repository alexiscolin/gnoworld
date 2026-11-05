// What r/sys/namereg/v0's Register checks first of a name, read live on onyx-1 and gnoland-1 (recordings README): the form
// `nym-[a-z]{5,13}\d{3}`, and a stem that does not start with a reserved prefix. The person types what follows `nym-`.
// The reserved role names and the canonical collisions are the chain's answer, shown as its error, never guessed here.
// Each pattern is built inside its function (typescript.md).

/** What every name starts with: the field shows it, and the message signed is it and what was typed. */
export const NYM_PREFIX = "nym-";

/** The words of the one rule, shown under the field before anything is asked: the frames' line. */
export const NYM_RULE = `5 to 13 letters, then 3 digits. Example: ${NYM_PREFIX}alexis042.`;

/** What is wrong with `typed`, in words, or nothing when Register would take it as to its form. */
export function nymProblem(typed: string): string | undefined {
  if (!/^[a-z]{5,13}\d{3}$/.test(typed)) return `Use ${NYM_RULE}`;
  if (/^(?:gl|g1|gno|atom|atone|photon|cosmos)/.test(typed))
    return "The letters cannot start with a reserved prefix: gl, g1, gno, atom, atone, photon or cosmos.";
  return undefined;
}
