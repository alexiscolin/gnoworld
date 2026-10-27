// The keep slice of the store (slice 4's 4d; docs/decisions.md, 2026-10-26, "fields are added only"): what an account keeps
// on its device, the lines it saved and, for each room, the reading place it asked to go back to. Read once at a
// session's start (lib/keep), changed from the device's own state at each change, so another tab's saves are not
// written over (R10), and never written over a device that could not be read.
import { lineOf, placeBefore, type IrcMessage, type Line } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import { asSaved, SAVED_KEPT, UNREAD_KEPT, type Keep, type SavedLine } from "../lib/keep/keep.ts";
import { lastKept, without } from "./record.ts";

interface Kept {
  /** The lines saved, the newest saved first. */
  readonly saved: readonly SavedLine[];
  /** The reading place asked for, by room: the time just before the line marked unread. */
  readonly unread: Readonly<Record<string, string>>;
  /** Whether the device did not keep what was asked: unreadable at the start, or refusing a write. */
  readonly notKept: boolean;
}

export interface KeepSlice {
  keep: Kept;
  keepActions: {
    /** A new session: the last one's forgotten, an account's lines and places read from its device, none for a guest. */
    begin: (device: Keep | undefined) => void;
    /** Saves a line of a room, on the device: "none" for a guest, a room or a line that is no room's or no plain
     * message, "full" past SAVED_KEPT. */
    save: (room: string, line: Line) => "saved" | "full" | "none";
    unsave: (room: string, id: string) => void;
    /** Asks to go back to the line: its room's reading place is the time just before it. */
    markUnread: (room: string, line: Line) => void;
    /** The reader read to the end of a room opened with its place: it is forgotten. */
    readThrough: (room: string) => void;
    /** One live line from Ergo: a REDACT of a saved line unsaves it, and its author's edit replaces its words (an edit
     * that leaves no plain message unsaves it); any other line changes nothing. */
    heard: (message: IrcMessage) => void;
  };
}

// The lines and places as the device holds them, and whether it could be read whole.
type Held = Pick<Kept, "saved" | "unread"> & { readonly readable: boolean };

const EMPTY: Kept = { saved: [], unread: {}, notKept: false };
const sameLine = (room: string, id: string) => (line: SavedLine) => line.room !== room || line.id !== id;

// The saved lines once an edit is heard: the line it corrects, when the same account wrote both, takes its words, or
// goes if they are no plain message.
const correctedBy = (saved: readonly SavedLine[], room: string, edit: Line): SavedLine[] =>
  saved.flatMap((old) =>
    old.room === room && old.id === edit.edits && old.account !== undefined && old.account === edit.account
      ? (asSaved(room, { ...old, account: old.account, text: edit.text, kind: edit.kind }) ?? [])
      : old,
  );

export const keepSlice: StateCreator<KeepSlice> = (set, get) => {
  // The session's device, none for a guest; whether it was read whole at the start, which alone it is written after.
  let device: Keep | undefined;
  let writable = false;
  // The lines and places as the device holds them now, so another tab's change is kept; the session's own memory when the
  // device cannot be read this time, which is then not written, and said so.
  const fresh = () => {
    const { saved, unread } = get().keep;
    const read = { saved: device?.saved(), unread: device?.unread() };
    return {
      saved: read.saved ?? saved,
      unread: read.unread ?? unread,
      readable: read.saved !== undefined && read.unread !== undefined,
    };
  };
  // Takes a change: the same object when nothing changed; the device written when it may be, `write` saying whether it
  // took it (a device that refused, or could not be read, noted). The other field is the device's too (F1488); what the
  // device holds and what the memory holds are judged apart, since another tab's change leaves them different.
  const commit = (next: Partial<Pick<Kept, "saved" | "unread">>, held: Held, write: () => boolean) => {
    const now = get().keep;
    const kept = { saved: next.saved ?? held.saved, unread: next.unread ?? held.unread };
    const same = (than: Pick<Kept, "saved" | "unread">) =>
      JSON.stringify(kept) === JSON.stringify({ saved: than.saved, unread: than.unread });
    const onDevice = same(held);
    if (onDevice && same(now)) return;
    const refused = held.readable && writable && !onDevice && !write();
    set({ keep: { ...kept, notKept: now.notKept || !held.readable || refused } });
  };
  const commitSaved = (saved: readonly SavedLine[], held: Held) => {
    commit({ saved }, held, () => device?.setSaved(saved) === true);
  };
  const commitUnread = (unread: Readonly<Record<string, string>>, held: Held) => {
    commit({ unread }, held, () => device?.setUnread(unread) === true);
  };
  return {
    keep: EMPTY,
    keepActions: {
      begin: (next) => {
        device = next;
        const saved = next?.saved();
        const unread = next?.unread();
        writable = saved !== undefined && unread !== undefined;
        const started: Kept = {
          saved: saved ?? [],
          unread: unread ?? {},
          notKept: next !== undefined && !writable,
        };
        const now = get().keep;
        if (JSON.stringify(started) !== JSON.stringify(now)) set({ keep: started });
      },
      save: (room, line) => {
        const entry = asSaved(room, line);
        if (device === undefined || entry === undefined) return "none";
        const held = fresh();
        if (!held.saved.every(sameLine(room, line.id))) commitSaved(held.saved, held);
        else if (held.saved.length >= SAVED_KEPT) return "full";
        else commitSaved([entry, ...held.saved], held);
        return "saved";
      },
      unsave: (room, id) => {
        const held = fresh();
        commitSaved(held.saved.filter(sameLine(room, id)), held);
      },
      markUnread: (room, line) => {
        const place = placeBefore(line.time);
        if (device === undefined || place === undefined || !RoomId.safeParse(room).success) return;
        // The room marked longest ago goes first past the bound: its key goes to the end as it is marked again.
        const held = fresh();
        commitUnread(lastKept(held.unread, [room, place], UNREAD_KEPT), held);
      },
      readThrough: (room) => {
        const held = fresh();
        commitUnread(without(held.unread, room), held);
      },
      heard: (message) => {
        const [room = "", id = ""] = message.params;
        const held = fresh();
        if (message.command === "REDACT") {
          commitSaved(held.saved.filter(sameLine(room, id)), held);
          return;
        }
        const edit = lineOf(message, room);
        if (edit?.edits !== undefined) commitSaved(correctedBy(held.saved, room, edit), held);
      },
    },
  };
};
