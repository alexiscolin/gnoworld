// What the page says when a pin, an unpin or a save does not happen (slice 4's 4d, R9): what happened and what to do, in
// the person's words, never a code, one sentence for each cause the server or the device gives.
import type { FlashMessage } from "@gnoworld/ui";
import type { Done } from "./askPins.ts";

type Reason = Exclude<Done, { ok: true }>["reason"];
const UNREACHED = "The chat server could not be reached. Try again in a moment.";
const UNEXPECTED = "Something unexpected came back. Please try again.";

// Each reason's sentence: the type wants every reason a call of the server can end with.
const SAID: Record<Reason, string> = {
  full: "This room has ten pins already. Unpin one first.",
  too_many: "Too many pins and unpins in a minute. Try again shortly.",
  forbidden: "Only this world's moderators can pin in this room.",
  unauthenticated: "Your session ended: log in again.",
  not_found: "This message is no longer in the room's history.",
  refused: "This message cannot be pinned: only a plain message of an account can.",
  not_ready: UNREACHED,
  unavailable: UNREACHED,
  internal: UNREACHED,
  network: UNREACHED,
  malformed: UNEXPECTED,
  unsupported: UNEXPECTED,
  too_large: UNEXPECTED,
};

/** The flash of a pin or an unpin the server refused. */
export const pinProblem = (reason: Reason, what: "pin" | "unpin"): FlashMessage => ({
  title: `Could not ${what} the message.`,
  // An unpin of a line another moderator has unpinned, or whose line left, is told as it is.
  line: what === "unpin" && reason === "not_found" ? "It is not pinned any more." : SAID[reason],
});

/** The flash of a save the device did not take: its 200 lines are kept, or the line is no plain message of a room. */
export const saveProblem = (why: "full" | "none"): FlashMessage => ({
  title: "Could not save the message.",
  line: why === "full" ? "You have 200 saved messages. Remove one first." : "This message cannot be saved.",
});

// What an owner's hide or mute says when the server did not take it: `full` is a mute's table full, `forbidden` a room the reader does not
// moderate or an account that is spared, `refused` a mute that would reach rooms the reader does not moderate or a line that cannot be hidden.
const MODERATION: Record<Reason, string> = {
  ...SAID,
  full: "The mute list is full. Try again later.",
  too_many: "Too many acts in a minute. Try again shortly.",
  forbidden: "You do not moderate this room, or this account is spared: a moderator or a trusted account.",
  refused: "This cannot be done here: the mute would reach a room of this world you do not moderate.",
  not_ready: "Could not check, try again.",
  not_found: "This message is no longer in the room's history.",
};

/** The flash of a hide or a mute the server refused. */
export const moderationProblem = (reason: Reason, what: "hide" | "mute"): FlashMessage => ({
  title: what === "hide" ? "Could not hide the message." : "Could not mute the account.",
  line: MODERATION[reason],
});
