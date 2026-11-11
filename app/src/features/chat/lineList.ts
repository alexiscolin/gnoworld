// What a room's lines take (Lines.tsx): the props, what the list adds to them, and what a line shows beyond its words.
import type { Line, Reacting, Reaction, Shown, ShownLine } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import type { Entry } from "./chainEntries.ts";
import type { JarvisEntry } from "./jarvisEntries.tsx";
import { cardOf } from "./lineCard.ts";
import type { DayEntry } from "./lineMarks.ts";
import type { RoomKeeping } from "./RoomKeeping.ts";

export interface LinesProps {
  /** The room, whose lines have bars; none for a direct message's. */
  room: string | undefined;
  /** The partner of a direct message, whose lines have bars too (4d's DM bar), but no player and no link. */
  partner?: string | undefined;
  lines: readonly Line[];
  members: readonly string[];
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me: string | undefined;
  /** The msgid of a line Ergo refused to delete, said until dismissed. */
  refused?: string | undefined;
  /** Whether the chat is connected: a delete that cannot go out says why (U8). */
  connected: boolean;
  /** Deletes a line, the reader's own; whether it went out. A room's view may leave out what a line's actions do:
   * nothing then, and a delete or a reaction never goes out. */
  onDelete?: ((id: string) => boolean) | undefined;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss?: (() => void) | undefined;
  /** The room's reactions (4d), shown under their lines. */
  reactions?: readonly Reaction[] | undefined;
  /** Reacts to a line, or takes the reaction back, an account's; whether it went out. */
  onReact?: ((reaction: Reacting) => boolean) | undefined;
  /** Ergo refused a reaction the page sent here, said until dismissed (4d). */
  cannotReact?: true | undefined;
  /** Makes a line, by its msgid, the one the composer's next answers (4d). */
  onReply?: ((id: string) => void) | undefined;
  /** Opens the thread a line roots, by its msgid (4d's threads); none: no chip, no menu item. */
  onThread?: ((id: string) => void) | undefined;
  /** Puts a line's words in the composer to correct them, one of the reader's own (a direct message's). */
  onEdit?: ((id: string) => void) | undefined;
  /** The time of the last line the account read here, Ergo's (4f); none while unknown. */
  read?: string | undefined;
  /** The room's history page came: the New mark waits on it, as a live line may come before it (4f's G1). */
  paged?: boolean;
  /** The room read to its line `id`, the newest, while the reader is at the end and the page shows. */
  onRead?: ((id: string) => void) | undefined;
  /** The room's lines' verdicts, by msgid, from the server's stream (4g). */
  verdicts?: Readonly<Record<string, StreamEvent["state"]>> | undefined;
  /** Whether the reader saves data (ADR-0002 §8): then no player is offered (4g, F893). */
  saving?: boolean;
  /** What the reader keeps in this room and the room's pins (4d); none for a direct message's lines. */
  keeping?: RoomKeeping | undefined;
}

// What a line's actions do when a view gives none: nothing goes out.
export const NO_DELETE = () => false;
export const NO_DISMISS = () => undefined;
export const NO_REACT = () => false;
export const NO_REPLY = () => undefined;
export const NO_REPLIES: ReadonlyMap<string, readonly Line[]> = new Map();

// What the list takes of the room: its lines as shown, what each shows of the reactions, and the line a msgid names.
export type ListProps = Omit<LinesProps, "lines"> & {
  lines: readonly ShownLine[];
  shown: ReadonlyMap<string, readonly Shown[]>;
  lineOf: (id: string) => string;
  /** Who a mention may shorten. */
  known: ReadonlySet<string>;
  /** A reply's line by its msgid, this room's alone: a reply naming its own msgid or another room's answers none here. */
  byId: ReadonlyMap<string, Line>;
  /** Each line's reactions as chipsOf writes them, by msgid. */
  chips: ReadonlyMap<string, string>;
  /** Each poll line's votes as votesString writes them, by msgid. */
  votes: ReadonlyMap<string, string>;
  /** The room's lines with the chain's calls among them, and the lines that go on their author's group (once per change). */
  entries: readonly (Entry<ShownLine> | JarvisEntry | DayEntry)[];
  grouped: ReadonlySet<string>;
  /** The lines that are an account's first words in the room. */
  firsts: ReadonlySet<string>;
  /** Each root's replies, by msgid (4d's threads): a chip counts them. */
  repliesOf: ReadonlyMap<string, readonly Line[]>;
  /** The newest edit shown in each corrected line's place, by the line's msgid: the verdict a player waits on is its. */
  newest: ReadonlyMap<string, string>;
};

// What a line shows beyond its words: its chips, its poll's votes, and whether it is its author's first words.
export const marksOf = (props: ListProps, id: string) => ({
  chips: props.chips.get(id),
  votes: props.votes.get(id),
  newHere: props.firsts.has(id),
  card: cardOf(props, id),
});

// What the reader keeps of a line, on this device (saved) and in its room (pinned) (4d).
export const keptOf = (keeping: RoomKeeping | undefined, id: string) => ({
  saved: keeping?.saved.has(id) === true,
  pinned: keeping?.pinned.has(id) === true,
});

// The line a reply answers, when this room holds it: a reply naming its own msgid or another room's answers none here.
export const answeredBy = (line: ShownLine, byId: ReadonlyMap<string, Line>, lineOf: (id: string) => string) =>
  line.reply === line.id ? undefined : byId.get(lineOf(line.reply ?? ""));

// A corrected line's player waits on its newest edit's verdict, the words it shows being the edit's (F1921).
export const verdictIn = (
  verdicts: LinesProps["verdicts"],
  newest: ReadonlyMap<string, string>,
  id: string,
): StreamEvent["state"] | undefined => verdicts?.[newest.get(id) ?? id];
