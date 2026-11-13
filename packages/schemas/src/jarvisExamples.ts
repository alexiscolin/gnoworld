// The questions the composer offers once `@jarvis ` is typed, those of the place first. They are one list so the workshop's Jarvis
// stand-in can be proven to have a prepared answer for each of them.

const EARTH = ["what is gnoworld?", "what is a realm?", "what is gno.land?"];
const REALM = ["what does this realm do?", "summarize this room"];
const ANY = ["who is here?", "how do I send GNOT?", "how do I call a function?"];
const VOTE = "how do I vote on GovDAO?";

/** Every example there is. */
export const JARVIS_EXAMPLES: readonly string[] = [...EARTH, VOTE, ...REALM, ...ANY];

/** The examples for a room, the place's own first: the Earth's, or a realm's world's (the vote one in #govdao), then those for any room. */
export function jarvisExamples(room: string, realm: string | undefined): string[] {
  const own = room === "#earth" ? EARTH : realm === undefined ? [] : room === "#govdao" ? [VOTE, ...REALM] : REALM;
  return [...own, ...ANY];
}
