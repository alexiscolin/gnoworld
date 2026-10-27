// The keep slice of the store (slice 4's 4d; docs/decisions.md, 2026-10-26, "fields are added only"): what an account keeps
// on its device, the lines it saved and, for each room, the reading place it asked to go back to. Read once at a
// session's start (lib/keep), changed from the device's own state at each change, so another tab's saves are not
// written over (R10), and never written over a device that could not be read.
import { placeBefore, type Line } from "@gnoworld/core";
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
  };
}

const EMPTY: Kept = { saved: [], unread: {}, notKept: false };
const sameLine = (room: string, id: string) => (line: SavedLine) => line.room !== room || line.id !== id;

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
  // Takes a change: the same object when nothing changed; the device written when it may be, `write` saying whether it took
  // it; a device that refused, or could not be read, noted.
  const commit = (next: Partial<Pick<Kept, "saved" | "unread">>, readable: boolean, write: () => boolean) => {
    const now = get().keep;
    const kept = { saved: next.saved ?? now.saved, unread: next.unread ?? now.unread };
    if (JSON.stringify(kept) === JSON.stringify({ saved: now.saved, unread: now.unread })) return;
    const refused = readable && writable && !write();
    set({ keep: { ...kept, notKept: now.notKept || !readable || refused } });
  };
  const commitSaved = (saved: readonly SavedLine[], readable: boolean) => {
    commit({ saved }, readable, () => device?.setSaved(saved) === true);
  };
  const commitUnread = (unread: Readonly<Record<string, string>>, readable: boolean) => {
    commit({ unread }, readable, () => device?.setUnread(unread) === true);
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
        const { saved: base, readable } = fresh();
        if (!base.every(sameLine(room, line.id))) commitSaved(base, readable);
        else if (base.length >= SAVED_KEPT) return "full";
        else commitSaved([entry, ...base], readable);
        return "saved";
      },
      unsave: (room, id) => {
        const { saved, readable } = fresh();
        commitSaved(saved.filter(sameLine(room, id)), readable);
      },
      markUnread: (room, line) => {
        const place = placeBefore(line.time);
        if (device === undefined || place === undefined || !RoomId.safeParse(room).success) return;
        // The room marked longest ago goes first past the bound: its key goes to the end as it is marked again.
        const { unread, readable } = fresh();
        commitUnread(lastKept(unread, [room, place], UNREAD_KEPT), readable);
      },
      readThrough: (room) => {
        const { unread, readable } = fresh();
        commitUnread(without(unread, room), readable);
      },
    },
  };
};
