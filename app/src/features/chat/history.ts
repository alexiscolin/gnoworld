// A room's history read past its reactions (slice 4's 4d, R1): Ergo counts a stored reaction as a history item, so a
// page may hold few lines or none; while a full page leaves the room's window short of lines, the link asks for the
// items before the page's oldest, three times at most a room and a connection (docs/decisions.md, 2026-10-26).
import type { IrcMessage } from "@gnoworld/core";
import { LINES_KEPT } from "../../store/chat.ts";

/** The items a room's history page asks: the store's window. */
export const HISTORY_LINES = LINES_KEPT;
/** A msgid a command carries: one word of 64 characters at most (Ergo's are 26), no space, comma, NUL or leading colon. */
export const MSGID = /^[^\s,:\0][^\s,\0]{0,63}$/;
// The asks before a page's oldest, a room and a connection: a reaction flood's pages read past, then the room shown.
const EARLIER = 3;

/** A connection's asks before a page's oldest item, by room. */
export class Earlier {
  readonly #asked = new Map<string, number>();

  /** What to ask once a page of `items` is read into a room that now holds `held` lines: the items before its oldest,
   * while the page came full and left the window short of lines; or none. */
  after(room: string, items: readonly IrcMessage[], held: number): string | undefined {
    const [oldest = "", asked = 0] = [items[0]?.tags.get("msgid"), this.#asked.get(room)];
    if (items.length < HISTORY_LINES || held >= HISTORY_LINES || asked >= EARLIER || !MSGID.test(oldest)) return;
    this.#asked.set(room, asked + 1);
    return `CHATHISTORY BEFORE ${room} msgid=${oldest} ${String(HISTORY_LINES)}`;
  }

  /** The connection ended: a new one asks again. */
  clear(): void {
    this.#asked.clear();
  }
}
