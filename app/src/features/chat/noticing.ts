// What the link makes of Ergo's lines for the notices' slice (slice 4's 4f-n, moved out of link.ts): a notice for each
// line addressed to the account, none for a guest; the notices of a line REDACT takes away or of a room the account is
// out of; a conversation seen as Ergo's place for it passes. The classifier is core's (roomNotice, dmNotice); this reads
// what it needs from the store.
import { dmNotice, dmOf, lineOf, readAfter, roomNotice, type IrcMessage, type Line, type RoomAt } from "@gnoworld/core";
import type { createAppStore } from "../../store/index.ts";
import { modeOf, roomOf } from "../../store/notices.ts";
import type { AppState } from "../../store/index.ts";
import { outOf } from "./groups.ts";
import { isAccount } from "./names.ts";

type Store = ReturnType<typeof createAppStore>;

/** The deleted lines' ids kept at most, the newest: a history page open at a REDACT must not bring its notice back. */
const GONE_KEPT = 100;

export class Noticer {
  /** The rooms where a mention of the whole room counts, as the page told. */
  groups: ReadonlySet<string> = new Set();
  readonly #store: Store;
  // The ids of the lines REDACT took away, oldest first (a Set keeps its order).
  readonly #gone = new Set<string>();
  readonly #inside: ReadonlySet<string>;
  readonly #account: () => boolean;

  /** `inside` holds the rooms Ergo said I am in; `account` says whether the connection is an account's, a guest being told
   * nothing. */
  constructor(store: Store, inside: ReadonlySet<string>, account: () => boolean) {
    this.#store = store;
    this.#inside = inside;
    this.#account = account;
  }

  /** A line of Ergo's, live. */
  live(message: IrcMessage): void {
    const { noticeActions, chat } = this.#store.getState();
    const { me } = chat;
    const [room = "", id = ""] = message.params;
    if (message.command === "REDACT") this.#redacted(id);
    if (me === undefined || !this.#account()) return;
    if (outOf(message, me)) noticeActions.left(room);
    this.#marked(message, me);
    const dm = dmOf(message, me);
    if (dm === undefined) this.#room(message, room, me);
    else this.#dm(dm, me);
  }

  /** A room's history page, read: a notice for each line past the reading place Ergo gave, none while it gave none, and
   * none for a room the account is out of (a page asked before a KICK can come after it). */
  page(room: string, messages: readonly IrcMessage[]): void {
    this.#past(
      room,
      messages.map((message) => lineOf(message, room)),
    );
  }

  // The notices of these lines of a room that are past its reading place; the page's lines or, once the place is
  // known, the room's own (the page came first when Ergo's answer to MARKREAD came after it).
  #past(room: string, lines: readonly (Line | undefined)[]): void {
    const state = this.#store.getState();
    const { me } = state.chat;
    const at = me === undefined ? undefined : this.#at(state, room, me);
    const read = roomOf(state, room)?.read;
    if (!this.#account() || !this.#inside.has(room) || at === undefined || read === undefined) return;
    const made = lines.flatMap((line) => {
      const notice =
        line === undefined || line.time <= read || this.#gone.has(line.id) ? undefined : roomNotice(line, room, at);
      return notice === undefined ? [] : [notice];
    });
    state.noticeActions.addAll(made);
  }

  // A line REDACT took away: its notice goes, and the page open at it must not bring it back.
  #redacted(id: string): void {
    this.#store.getState().noticeActions.drop(id);
    this.#gone.add(id);
    for (const old of this.#gone) {
      if (this.#gone.size <= GONE_KEPT) break;
      this.#gone.delete(old);
    }
  }

  // Ergo's reading place, `MARKREAD <place> timestamp=…`: for a conversation, from another device, it sees it up to there;
  // for a room, the notices of the lines the room holds past it (a page that came before it made none).
  #marked(message: IrcMessage, me: string): void {
    const [place = ""] = message.params;
    if (message.command !== "MARKREAD" || place === me) return;
    if (!isAccount(place)) {
      this.#past(place, roomOf(this.#store.getState(), place)?.lines ?? []);
      return;
    }
    const time = readAfter(undefined, message, { room: place, now: Date.now() });
    if (time !== undefined) this.#store.getState().noticeActions.seen(place, time);
  }

  // A direct message the store kept: none for one it discards (the account hears those it wrote to alone).
  #dm(dm: NonNullable<ReturnType<typeof dmOf>>, me: string): void {
    const state = this.#store.getState();
    const kept = Object.hasOwn(state.dms, dm.partner) && state.dms[dm.partner]?.some(({ id }) => id === dm.line.id);
    const notice = kept === true ? dmNotice(dm, me) : undefined;
    if (notice !== undefined) state.noticeActions.add(notice);
  }

  // A room's line, in a room the page follows and Ergo said I am in.
  #room(message: IrcMessage, room: string, me: string): void {
    const state = this.#store.getState();
    const at = this.#at(state, room, me);
    const line = lineOf(message, room);
    if (at === undefined || line === undefined || !this.#inside.has(room)) return;
    const notice = roomNotice(line, room, at);
    if (notice !== undefined) state.noticeActions.add(notice);
  }

  // What the reader is, and holds, in a room the page follows; none for a room it does not.
  #at(state: AppState, room: string, me: string): RoomAt | undefined {
    const held = roomOf(state, room);
    return held === undefined
      ? undefined
      : { me, mode: modeOf(state, room), held: held.lines, groups: this.groups.has(room) };
  }
}
