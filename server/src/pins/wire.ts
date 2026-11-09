// The pins' part of the chat (slice 4's 4d): the pins on the chat's database, asking Ergo through its link, who may pin
// and read them, and what the link tells that ends a pin with its line (docs/decisions.md, 2026-10-27).
import type { DatabaseSync } from "node:sqlite";
import { PINS_MAX } from "@gnoworld/schemas";
import type { Link, Said } from "../irc/link.ts";
import type { Log } from "@gnoworld/service/log";
import { mayRead, staffOf, type Typed } from "../rooms/types.ts";
import { makePins, type Pins } from "./pins.ts";

interface Parts {
  // The chat's link, once it has one: none while Ergo is not set, nor before the link is made.
  link: () => Link | undefined;
  now: () => number;
  log: Log;
  // The account that made a public room of the Earth, who moderates it too (D394); none for any other room.
  maker?: ((room: string) => string | undefined) | undefined;
}

export function pinsFor(db: DatabaseSync, roles: Typed, { link, now, log, maker = () => undefined }: Parts) {
  const pins: Pins = makePins({
    db,
    fetch: (room, msgid) => link()?.line(room, msgid) ?? Promise.resolve("unanswered"),
    now,
    max: PINS_MAX,
  });
  return {
    api: {
      pins,
      // The room's world's moderators and the team, and its maker for a public room; everyone reads as the stream says.
      mayPin: (room: string, who: string): boolean => staffOf(roles, room, who) || maker(room) === who,
      mayRead: (room: string, who: string | undefined): boolean => mayRead(roles, room, who),
    },
    // What the link hears, as its options take it: a line taken from a room (its author's delete, the bot's hide), and
    // the link in a room, whose pins are asked of Ergo again for a delete it missed.
    hooks: {
      onRedact: pins.drop,
      onIn: (room: string): void => {
        pins.check(room).catch((error: unknown) => {
          log("pins_unchecked", { room, error: error instanceof Error ? error.name : "unknown" });
        });
      },
    },
    // A line that replaces another, its author's edit: the replaced line's pin goes.
    onEdit: ({ room, edits, account, msgid }: Said): void => {
      if (edits !== undefined) pins.edited(room, edits, { account, msgid });
    },
  };
}
