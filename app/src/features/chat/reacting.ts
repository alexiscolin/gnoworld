// What the link knows of a reaction Ergo may refuse (slice 4's 4d, apart from link.ts): a reaction is labelled with the
// room it is for, as Ergo answers a labelled command by its label, a refusal included.
import type { IrcMessage } from "@gnoworld/core";

const LABEL = "react:";

/** The label of a reaction to a line of `room`. */
export const reactLabel = (room: string): string => `${LABEL}${room}`;

/** The room whose reaction Ergo refused with this line, or none: its 404 (a +m room, a mute) on a reaction's label; the
 * label is Ergo's to echo, its tag value bounded at 4,094 bytes, a room id at 64. */
export function refusedIn({ tags, command }: IrcMessage): string | undefined {
  const label = tags.get("label");
  return command === "404" && label?.startsWith(LABEL) === true ? label.slice(LABEL.length) : undefined;
}
