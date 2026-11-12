// A line of the composer that speaks to Jarvis: it starts with the word `@jarvis` and a space, and goes to Jarvis, not to the room.

/** What the button puts at the start of a draft. */
export const JARVIS_MENTION = "@jarvis ";

/** The question a line asks of Jarvis, or none when it does not start with `@jarvis ` or asks nothing after it. */
export function jarvisQuestion(draft: string): string | undefined {
  if (!draft.startsWith(JARVIS_MENTION)) return undefined;
  const question = draft.slice(JARVIS_MENTION.length).trim();
  return question === "" ? undefined : question;
}
