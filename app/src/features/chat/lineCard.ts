// Which card a line gets (link-previews L4, D13919): one card a line, a player or a realm's capture first; only a checked line's, in a room
// (a direct message's lines are never checked); one that its author, or one who may pin in the room, can remove.
import type { StreamEvent } from "@gnoworld/schemas";
import { own } from "../../store/record.ts";
import type { RoomKeeping } from "./RoomKeeping.ts";

export interface LineCardFacts {
  /** The key the server's event gave the line, none before it. */
  key: string | undefined;
  verdict: StreamEvent["state"] | undefined;
  /** None for a direct message's line. */
  room: string | undefined;
  /** The line has a player, or a realm page's capture: the card gives way to either. */
  player: boolean;
  capture: boolean;
  /** The reader wrote the line. */
  mine: boolean;
  /** The reader may pin in the room, its moderators and its world's owner. */
  may: boolean;
}

export function lineCard({ key, verdict, room, player, capture, mine, may }: LineCardFacts) {
  const shown = key !== undefined && verdict === "checked" && room !== undefined && !player && !capture;
  return shown ? { key, removable: mine || may } : undefined;
}

/** What a line's card needs of its list: none outside a room. A corrected line's card is its newest edit's, as its verdict is. */
export function cardOf(
  {
    room,
    newest,
    keeping,
    saving = false,
  }: {
    room: string | undefined;
    newest: ReadonlyMap<string, string>;
    keeping?: Pick<RoomKeeping, "moderate" | "cards"> | undefined;
    saving?: boolean | undefined;
  },
  id: string,
) {
  const msgid = newest.get(id) ?? id;
  const key = keeping?.cards === undefined ? undefined : own(keeping.cards, msgid);
  return room === undefined ? undefined : { room, msgid, key, may: keeping?.moderate !== undefined, saving };
}

/** The same as bare values, for the props of a line that is drawn again only when one of them changes (F1222): no msgid, no card. */
export const cardMarks = (...asked: Parameters<typeof cardOf>) => {
  const card = cardOf(...asked);
  return { cardMsgid: card?.msgid, cardKey: card?.key, may: card?.may ?? false, saving: card?.saving ?? false };
};
