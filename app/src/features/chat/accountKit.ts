// What the page's link keeps for an account alone (slice 4, moved out of link.ts): what it sends (lines, corrections,
// reactions, deletes, typing), the reading places it asks Ergo to keep, the lines a direct message waits an answer to,
// and the notices it makes of what it hears. A guest's link has none of it, and a visitor's page never loads its code
// (the first screen's budget, ADR-0001 §12; docs/decisions.md, 2026-10-28).
import type { IrcMessage } from "@gnoworld/core";
import type { Ergo } from "../../lib/ergo/ergo.ts";
import type { createAppStore } from "../../store/index.ts";
import { refusedIn } from "./reacting.ts";
import { Noticer } from "./noticing.ts";
import { outbox, type Outbox } from "./outbox.ts";
import { Speaking } from "./speaking.ts";
import { Places, TypingOut } from "./telling.ts";

// What the kit reads as it speaks and the room's menu sets, through here: an account loads both, and a file of its own would be one more on
// every first load's list and in nginx's table (F3665).
export { keepCountry, keptCountry, zoneCountry } from "../../lib/country.ts";

/** What the link lends: the store, the connection and the key of its session ("guest" or an address), the way out to
 * Ergo, and the rooms Ergo said I am in. */
export interface KitHost {
  store: ReturnType<typeof createAppStore>;
  ergo: () => Ergo | undefined;
  key: () => string | undefined;
  out: (line: string) => boolean;
  inside: ReadonlySet<string>;
}

export interface Kit {
  speaking: Speaking;
  places: Places;
  outbox: Outbox;
  /** The rooms where a mention of the whole room counts. */
  groups: (rooms: ReadonlySet<string>) => void;
  /** A line of Ergo's, live: what an outgoing line waits for, a reaction it refused, and the notice it makes. */
  heard: (message: IrcMessage) => void;
  /** A history page, for the notices its lines make. */
  paged: (room: string, messages: readonly IrcMessage[]) => void;
  /** The connection ended: what it had begun is forgotten. */
  forgot: () => void;
}

/** Makes an account's kit for a link. */
export type MakeKit = (host: KitHost) => Kit;

export const makeKit: MakeKit = ({ store, ergo, key, out, inside }) => {
  const typing = new TypingOut();
  const sent = outbox(store);
  const notices = new Noticer(store, inside, () => key() !== "guest");
  const places = new Places((room) => store.getState().chat.rooms[room]?.read, out);
  const speaking = new Speaking({ ergo, key, inside, outbox: sent, typing, store });
  return {
    places,
    outbox: sent,
    speaking,
    groups: (rooms) => {
      notices.groups = rooms;
    },
    // A labeled-response batch's lines carry no label: the batch's own line does, read at its end (link.ts).
    heard: (message) => {
      sent.answered(message.tags, [message]);
      speaking.heard(message);
      notices.live(message);
      const refused = refusedIn(message);
      if (refused !== undefined) store.getState().chatActions.reactionRefused(refused);
    },
    paged: (room, messages) => {
      notices.page(room, messages);
    },
    forgot: () => {
      typing.forget();
      places.reconnected();
      sent.clear();
    },
  };
};
