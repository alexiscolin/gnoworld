// The notices' slice of the store (slice 4's 4f-n): what the account was told (a mention, a reply, a message to it), which
// of that it has not seen, each room's mode, and what each room and conversation counts. A notice is unseen until the
// reader has seen its place up to its time: by the page's own mark (the end of the room reached, the tab shown) or by
// Ergo's reading place for the room (a read on another device). The modes are read from the account's device at its
// session's start and written back on change, those that are not the default alone.
import { DEFAULT_MODE, type Notice, type NoticeMode } from "@gnoworld/core";
import type { StateCreator } from "zustand/vanilla";
import type { NoticePrefs } from "../lib/notices/prefs.ts";
import type { ChatSlice } from "./chat.ts";
import { heardFrom, type DmSlice } from "./dms.ts";
import type { LoginSlice } from "./login.ts";

/** The notices kept at most for each place (a room, a conversation), the newest: a flood in one drops its own oldest. */
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
    /** A notice, once: the same line twice, or more than NOTICES_KEPT of a place, changes nothing of what was held but
     * that place's oldest. */
    add: (notice: Notice) => void;
    /** A page's notices, as `add` takes each, in one change. */
    addAll: (notices: readonly Notice[]) => void;
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

type State = ChatSlice & DmSlice & LoginSlice & NoticeSlice;

// A record's own entry: the ids are the relay's, and a room named `constructor` is no one's prototype.
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
/** A room the page follows, by its id. */
export const roomOf = (state: State, where: string) => own(state.chat.rooms, where);
const later = (one: string | undefined, other: string | undefined) =>
  one === undefined || (other !== undefined && other > one) ? other : one;

/** What a room does with its notices: its mode, mentions unless the reader chose another. */
export const modeOf = (state: State, room: string): NoticeMode => own(state.noticeModes, room) ?? DEFAULT_MODE;

// Where the reader has seen a room up to: the page's mark, or Ergo's reading place, the later; a conversation, the mark.
const markOf = (state: State, where: string) => later(own(state.noticeSeen, where), roomOf(state, where)?.read);

// Whether a notice counts: a conversation's after its mark, while the store keeps that conversation and the account
// hears from its partner (else it has no row to open or to mark seen); a room's while the page follows it, its mode is not
// none and the reader has not seen its time.
function unseen(state: State, notice: Notice): boolean {
  const { kind, where, time } = notice;
  if (kind === "dm") {
    if (!Object.hasOwn(state.dms, where) || !heardFrom(state.dmChoices, where)) return false;
  } else if (roomOf(state, where) === undefined || modeOf(state, where) === "none") return false;
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

// The reader's address: the connection's nick, else (while it is down) the session's account, so a line of one's own that
// came before a drop is never new to oneself.
const meOf = ({ chat, login }: State) => chat.me ?? (login.session.kind === "in" ? login.session.address : undefined);

// The lines of a room in all mode that are new to the reader: past its mark, another's, no NOTICE, no edit. None while
// the mark is unknown, as a history page makes no notice then (a never read room is not "200 unread").
function newLines(state: State, where: string) {
  const mark = markOf(state, where);
  if (mark === undefined) return [];
  const me = meOf(state);
  return (roomOf(state, where)?.lines ?? []).filter(
    ({ time, kind, edits, account }) => kind !== "notice" && edits === undefined && account !== me && time > mark,
  );
}

/** What each place counts, in one pass: a room's unseen notices, or in all mode its new lines, which a notice is one of;
 * none in none; a conversation's unseen notices. A place that counts nothing is not in it. */
export function placeCounts(state: State): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  // A room in all mode counts its lines, whatever its notices.
  const byLines = (where: string) => roomOf(state, where) !== undefined && modeOf(state, where) === "all";
  for (const notice of state.notices) {
    if (!byLines(notice.where) && unseen(state, notice)) counts.set(notice.where, (counts.get(notice.where) ?? 0) + 1);
  }
  for (const where of Object.keys(state.chat.rooms)) {
    const lines = byLines(where) ? newLines(state, where).length : 0;
    if (lines > 0) counts.set(where, lines);
  }
  return counts;
}

/** What a room or a conversation counts. */
export const badgeOf = (state: State, where: string): number => placeCounts(state).get(where) ?? 0;

/** What the page counts in all: every room followed and every conversation, each by its own count. */
export const totalUnseen = (state: State): number => [...placeCounts(state).values()].reduce((sum, n) => sum + n, 0);

// The time a place has to be marked seen to count nothing: its newest unseen notice, and in all mode its newest line.
function newest(state: State, where: string): string | undefined {
  const times = state.notices.filter((notice) => notice.where === where && unseen(state, notice)).map((n) => n.time);
  const lines = modeOf(state, where) === "all" ? newLines(state, where).map(({ time }) => time) : [];
  return [...times, ...lines].reduce<string | undefined>(later, undefined);
}

// The modes that are not the default.
const kept = (modes: Readonly<Record<string, NoticeMode>>) =>
  Object.fromEntries(Object.entries(modes).filter(([, mode]) => mode !== DEFAULT_MODE));

// The notices held with `fresh` added, each once, a place's uncounted or else oldest going past its cap; none when
// nothing is new.
function withNotices(state: State, fresh: readonly Notice[]): Notice[] | undefined {
  const list = [...state.notices];
  let changed = false;
  for (const notice of fresh) {
    if (list.some(({ id }) => id === notice.id)) continue;
    changed = true;
    list.push(notice);
    const place = list.filter(({ where }) => where === notice.where);
    if (place.length > NOTICES_KEPT) {
      const [oldest = notice] = place;
      list.splice(list.indexOf(place.find((each) => !unseen(state, each)) ?? oldest), 1);
    }
  }
  return changed ? list : undefined;
}

export const noticeSlice: StateCreator<State, [], [], NoticeSlice> = (set, get) => {
  // The session's device, and whether it could be read: never written over one that could not (like the DMs').
  let device: NoticePrefs | undefined;
  let writable = false;
  const add = (fresh: readonly Notice[]) => {
    const list = withNotices(get(), fresh);
    if (list !== undefined) set({ notices: list });
  };
  return {
    notices: [],
    noticeSeen: {},
    noticeModes: {},
    noticeNotKept: false,
    noticeActions: {
      add: (notice) => {
        add([notice]);
      },
      addAll: add,
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
        const marks = [...placeCounts(state).keys()].flatMap((where) => {
          const time = newest(state, where);
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
        // The device's own modes, which another page may have changed since this one read them.
        const fresh = writable ? device?.modes() : undefined;
        const noticeModes = kept({ ...(fresh ?? state.noticeModes), [room]: mode });
        set({ noticeModes });
        if (device !== undefined && (fresh === undefined || !device.setModes(noticeModes)))
          set({ noticeNotKept: true });
      },
    },
  };
};
