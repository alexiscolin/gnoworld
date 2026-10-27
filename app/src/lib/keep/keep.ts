// What an account keeps on its device (slice 4's 4d; ADR-0002's "Saved messages and drafts: Device" and "Mark unread:
// 0, on the device"): the lines it saved, and for each room the reading place it asked to go back to, each in one key
// of the page's storage under its address. Neither goes to any other device. What the device gives back is checked: a
// line or a place that is none is dropped and the good ones kept; text that is no list forgets the key; a device that
// refuses (blocked, full) keeps nothing and says so.
import type { Line } from "@gnoworld/core";
import { Address, PinId, RoomId, Time } from "@gnoworld/schemas";
import type { DraftStorage } from "../drafts/drafts.ts";
import { z } from "../jitless.ts";

/** The lines saved at most. */
export const SAVED_KEPT = 200;
/** The rooms a place is kept for at most: a session joins 100 (Ergo's max-channels-per-client). */
export const UNREAD_KEPT = 100;

// A saved line: the line as the page held it, its room with it, its author's nick (an address for an account, which
// the account tag alone proves), and its words, a message's 510 characters at most.
const Saved = z.strictObject({
  room: RoomId,
  id: PinId,
  time: Time,
  from: z.string().check(z.minLength(1), z.maxLength(64)),
  account: z.optional(Address),
  text: z.string().check(z.minLength(1), z.maxLength(510)),
});
export type SavedLine = z.infer<typeof Saved>;

/** A line as a saved one, or none for a line that is no plain message of a room, or too long or odd for the device. */
export function asSaved(
  room: string,
  { id, time, from, account, text, kind }: Pick<Line, "id" | "time" | "from" | "account" | "text" | "kind">,
): SavedLine | undefined {
  const saved = Saved.safeParse({ room, id, time, from, ...(account === undefined ? {} : { account }), text });
  return kind === "message" && saved.success ? saved.data : undefined;
}

export interface Keep {
  /** The saved lines, the newest saved first; none when the device could not be read, which is then left as it is. */
  saved: () => SavedLine[] | undefined;
  /** Keeps the saved lines, SAVED_KEPT at most; whether the device kept them. */
  setSaved: (lines: readonly SavedLine[]) => boolean;
  /** The reading place asked for each room, in Ergo's one form of time; none when the device could not be read. */
  unread: () => Record<string, string> | undefined;
  /** Keeps the places, UNREAD_KEPT rooms at most; whether the device kept them. */
  setUnread: (places: Readonly<Record<string, string>>) => boolean;
}

// The device's list, or its object's entries, as the shape the key holds; none for any other.
const itemsOf = (value: unknown): unknown[] | undefined => (Array.isArray(value) ? value : undefined);
const entriesOf = (value: unknown): [string, unknown][] | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Object.entries(value) : undefined;

/** An account's saved lines and places on the device `storage` reaches. */
export function keep(storage: () => DraftStorage, account: Address): Keep {
  const keys = { saved: `gnoworld:saved:${account}`, unread: `gnoworld:unread:${account}` };
  // What the key holds in the shape `pick` reads, a key holding another shape forgotten; none if unreadable.
  const read = <T>(key: string, pick: (value: unknown) => T[] | undefined): T[] | undefined => {
    try {
      const held = storage().getItem(key);
      if (held === null) return [];
      let value: unknown;
      try {
        value = JSON.parse(held);
      } catch {
        // Text that is no JSON is no list, and forgotten as any other shape is.
        value = undefined;
      }
      const got = pick(value);
      if (got === undefined) storage().removeItem(key);
      return got ?? [];
    } catch {
      return undefined;
    }
  };
  // A write, or a removal for nothing to keep: whether the device took it.
  const write = (key: string, value: unknown, none: boolean): boolean => {
    try {
      if (none) storage().removeItem(key);
      else storage().setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  return {
    saved: () =>
      read(keys.saved, (value) =>
        itemsOf(value)?.flatMap((item) => {
          const line = Saved.safeParse(item);
          return line.success ? [line.data] : [];
        }),
      )?.slice(0, SAVED_KEPT),
    setSaved: (lines) => lines.length <= SAVED_KEPT && write(keys.saved, lines, lines.length === 0),
    unread: () => {
      const places = read(keys.unread, (value) =>
        entriesOf(value)?.flatMap(([room, time]): [string, string][] => {
          const at = Time.safeParse(time);
          return RoomId.safeParse(room).success && at.success ? [[room, at.data]] : [];
        }),
      );
      return places === undefined ? undefined : Object.fromEntries(places.slice(0, UNREAD_KEPT));
    },
    setUnread: (places) => {
      const count = Object.keys(places).length;
      return count <= UNREAD_KEPT && write(keys.unread, places, count === 0);
    },
  };
}
