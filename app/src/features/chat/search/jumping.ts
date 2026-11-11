// The link's side of opening a room at a found message (slice 13, C): the jump asked, its window given to the store, the way back.
import type { IrcMessage } from "@gnoworld/core";
import type { createAppStore } from "../../../store/index.ts";
import { HISTORY_LINES } from "../history.ts";
import type { ChatLink } from "../linkTypes.ts";
import { Jumps } from "./jump.ts";

export class Jumping {
  readonly #jumps = new Jumps();
  readonly #store: ReturnType<typeof createAppStore>;
  readonly #out: (line: string) => boolean;

  /** `out` puts a line to Ergo, saying whether it went. */
  constructor(store: ReturnType<typeof createAppStore>, out: (line: string) => boolean) {
    this.#store = store;
    this.#out = out;
  }

  /** Asks the window around a message; whether it went. */
  around(room: string, msgid: string): boolean {
    const command = this.#jumps.ask(room, msgid);
    return command !== undefined && this.#out(command);
  }

  /** Ends a read around a message: the room's newest lines are asked again. */
  latest(room: string): void {
    if (this.#store.getState().chat.rooms[room]?.jump === undefined) return;
    this.#store.getState().chatJump.left(room);
    this.#out(`CHATHISTORY LATEST ${room} * ${String(HISTORY_LINES)}`);
  }

  /** Reads a history page: the window of the jump waiting for it goes to the store; whether it was that page. */
  page(room: string, messages: readonly IrcMessage[]): boolean {
    const found = this.#jumps.answer(room, messages);
    if (found !== undefined) this.#store.getState().chatJump.jumped(room, found, messages);
    return found !== undefined;
  }
}

const held = new WeakMap<ChatLink, Jumping>();

/** The link's jumping, made with its first use: it reads the link's history pages from then on. */
export function jumpingOf(store: ReturnType<typeof createAppStore>, link: ChatLink): Jumping {
  const made = held.get(link) ?? new Jumping(store, link.ask);
  if (!held.has(link)) {
    held.set(link, made);
    link.taps.add((room, messages) => made.page(room, messages));
  }
  return made;
}
