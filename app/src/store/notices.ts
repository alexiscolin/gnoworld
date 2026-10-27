// The notices' slice of the store (slice 4's 4f-n): what the account was told (a mention, a reply, a message to it), which
// of that it has not seen, each room's mode, and what each room and conversation counts. A notice is unseen until the
// reader has seen its place up to its time: by the page's own mark (the end of the room reached, the tab shown) or by
// Ergo's reading place for the room (a read on another device). The modes are read from the account's device at its
// session's start and written back on change, those that are not the default alone.
import { DEFAULT_MODE, type Notice, type NoticeMode } from "@gnoworld/core";
import type { StateCreator } from "zustand/vanilla";
import type { NoticePrefs } from "../lib/notices/prefs.ts";
import type { ChatSlice } from "./chat.ts";

/** The notices kept at most, the newest. */
export const NOTICES_KEPT = 100;

export interface NoticeSlice {
  /** What the account was told, oldest first. */
  notices: readonly Notice[];
  /** For each room, and each conversation by its partner, the time up to which the page has seen it. */
  noticeSeen: Readonly<Record<string, string>>;
  /** The rooms whose mode is not the default. */
  noticeModes: Readonly<Record<string, NoticeMode>>;
  /** Whether the session's device failed to keep the modes: it refused a write, or could not be read. */
  noticeNotKept: boolean;
  noticeActions: {
    /** A notice, once: the same line twice, or more than NOTICES_KEPT, changes nothing of what was held but its oldest. */
    add: (notice: Notice) => void;
    /** The notice of a line that is gone (deleted, hidden). */
    drop: (id: string) => void;
    /** The account is out of the room: its notices go. */
    left: (room: string) => void;
    /** A room, or a conversation, seen up to `time`: a mark only moves forward. */
    seen: (where: string, time: string) => void;
    /** Everything unseen, seen. */
    clear: () => void;
    /** A new session: no notice, no mark, and the modes the account's device holds; none for a guest. */
    begin: (prefs?: NoticePrefs) => void;
    setMode: (room: string, mode: NoticeMode) => void;
  };
}

type State = ChatSlice & NoticeSlice;

// A record's own entry: the ids are the relay's, and a room named `constructor` is no one's prototype.
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
const roomOf = (state: State, where: string) => own(state.chat.rooms, where);
const later = (one: string | undefined, other: string | undefined) =>
  one === undefined || (other !== undefined && other > one) ? other : one;

/** What a room does with its notices: its mode, mentions unless the reader chose another. */
export const modeOf = (state: State, room: string): NoticeMode => own(state.noticeModes, room) ?? DEFAULT_MODE;

// Where the reader has seen a room up to: the page's mark, or Ergo's reading place, the later; a conversation, the mark.
const markOf = (state: State, where: string) => later(own(state.noticeSeen, where), roomOf(state, where)?.read);

// Whether a notice counts: a conversation's after its mark; a room's while the page follows it, its mode is not none and
// the reader has not seen its time.
function unseen(state: State, notice: Notice): boolean {
  const { kind, where, time } = notice;
  if (kind !== "dm" && (roomOf(state, where) === undefined || modeOf(state, where) === "none")) return false;
  return time > (markOf(state, where) ?? "");
}

// ponytail: one list kept for the last call, its notices compared one by one, so a selector's answer is the same array
// while nothing it holds changed (zustand draws again for each new one); a store a test makes replaces it.
let listed: readonly Notice[] = [];
/** The notices that count, oldest first: the same array while they are the same. */
export function unseenNotices(state: State): readonly Notice[] {
  const next = state.notices.filter((notice) => unseen(state, notice));
  if (next.length === listed.length && next.every((notice, at) => notice === listed[at])) return listed;
  listed = next;
  return next;
}

// The lines of a room in all mode that are new to the reader: past its mark, another's, no NOTICE, no edit.
function newLines(state: State, where: string) {
  const mark = markOf(state, where);
  const lines = roomOf(state, where)?.lines ?? [];
  return lines.filter(
    ({ time, kind, edits, account }) =>
      kind !== "notice" && edits === undefined && account !== state.chat.me && (mark === undefined || time > mark),
  );
}

/** What a room or a conversation counts: a room's unseen notices, or in all mode its new lines, which a notice is one of;
 * none in none; a conversation's unseen notices. */
export function badgeOf(state: State, where: string): number {
  if (roomOf(state, where) !== undefined && modeOf(state, where) === "all") return newLines(state, where).length;
  return state.notices.filter((notice) => notice.where === where && unseen(state, notice)).length;
}

const placesOf = (state: State): string[] => [
  ...Object.keys(state.chat.rooms),
  ...new Set(state.notices.filter(({ kind }) => kind === "dm").map(({ where }) => where)),
];

/** What the page counts in all: every room followed and every conversation, each by its own count. */
export const totalUnseen = (state: State): number =>
  placesOf(state).reduce((sum, where) => sum + badgeOf(state, where), 0);

// The time a place has to be marked seen to count nothing: its newest unseen notice, and in all mode its newest line.
function newest(state: State, where: string): string | undefined {
  const times = state.notices.filter((notice) => notice.where === where && unseen(state, notice)).map((n) => n.time);
  const lines = modeOf(state, where) === "all" ? newLines(state, where).map(({ time }) => time) : [];
  return [...times, ...lines].reduce<string | undefined>(later, undefined);
}

// The modes that are not the default.
const kept = (modes: Readonly<Record<string, NoticeMode>>) =>
  Object.fromEntries(Object.entries(modes).filter(([, mode]) => mode !== DEFAULT_MODE));

export const noticeSlice: StateCreator<State, [], [], NoticeSlice> = (set, get) => {
  // The session's device, and whether it could be read: never written over one that could not (like the DMs').
  let device: NoticePrefs | undefined;
  let writable = false;
  return {
    notices: [],
    noticeSeen: {},
    noticeModes: {},
    noticeNotKept: false,
    noticeActions: {
      add: (notice) => {
        const { notices } = get();
        if (notices.some(({ id }) => id === notice.id)) return;
        const list = [...notices, notice];
        if (list.length > NOTICES_KEPT) {
          // A notice no one counts goes first, else the oldest.
          const gone = list.findIndex((each) => !unseen(get(), each));
          list.splice(gone === -1 ? 0 : gone, 1);
        }
        set({ notices: list });
      },
      drop: (id) => {
        const { notices } = get();
        if (notices.some((notice) => notice.id === id)) set({ notices: notices.filter((notice) => notice.id !== id) });
      },
      left: (room) => {
        const state = get();
        const rest = state.notices.filter(({ where, kind }) => where !== room || kind === "dm");
        // In all mode the room's lines stay held and would go on counting: they are seen up to the newest.
        const time = modeOf(state, room) === "all" ? newest(state, room) : undefined;
        if (rest.length === state.notices.length && time === undefined) return;
        set({
          notices: rest,
          ...(time === undefined ? {} : { noticeSeen: { ...state.noticeSeen, [room]: time } }),
        });
      },
      seen: (where, time) => {
        const { noticeSeen } = get();
        const was = own(noticeSeen, where);
        if (was !== undefined && was >= time) return;
        set({ noticeSeen: { ...noticeSeen, [where]: time } });
      },
      clear: () => {
        const state = get();
        const marks = placesOf(state).flatMap((where) => {
          const time = badgeOf(state, where) > 0 ? newest(state, where) : undefined;
          return time === undefined ? [] : [[where, time] as const];
        });
        if (marks.length > 0) set({ noticeSeen: { ...state.noticeSeen, ...Object.fromEntries(marks) } });
      },
      begin: (prefs) => {
        device = prefs;
        const held = prefs?.modes();
        writable = held !== undefined;
        const noticeModes = kept(held ?? {});
        const noticeNotKept = prefs !== undefined && !writable;
        const state = get();
        const empty = state.notices.length === 0 && Object.keys(state.noticeSeen).length === 0;
        if (empty && Object.keys(state.noticeModes).length === 0 && Object.keys(noticeModes).length === 0) {
          if (state.noticeNotKept !== noticeNotKept) set({ noticeNotKept });
          return;
        }
        set({ notices: [], noticeSeen: {}, noticeModes, noticeNotKept });
      },
      setMode: (room, mode) => {
        const state = get();
        if (modeOf(state, room) === mode) return;
        const noticeModes = kept({ ...state.noticeModes, [room]: mode });
        set({ noticeModes });
        if (device !== undefined && (!writable || !device.setModes(noticeModes))) set({ noticeNotKept: true });
      },
    },
  };
};
