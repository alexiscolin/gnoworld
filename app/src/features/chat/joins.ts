// Where the rooms this page follows stand on a connection (slice 4's 4b, moved out of link.ts): a JOIN went for a room,
// its history went; and the rooms Ergo said, live, I am in.
import type { IrcMessage } from "@gnoworld/core";
import { groupsOf } from "./groups.ts";
import { Earlier } from "./history.ts";

// Where a room this page follows stands on this connection: a JOIN went for it; its history went.
type Phase = "joined" | "asked";

export class Joins {
  readonly #phases = new Map<string, Phase>();
  // The rooms Ergo said, live, I am in on this connection, joined by this page or not: with Ergo's multiclient a
  // second tab's own JOIN brings no echo, Ergo having told it of the room at its welcome or as the first joined.
  readonly inside = new Set<string>();
  readonly #earlier = new Earlier();
  readonly #send: (line: string) => boolean;

  /** `send` puts a line to Ergo, saying whether it went (none while not connected). */
  constructor(send: (line: string) => boolean) {
    this.#send = send;
  }

  /** Where the room stands. */
  phase(room: string): Phase | undefined {
    return this.#phases.get(room);
  }

  /** Its history went. */
  asked(room: string): void {
    this.#phases.set(room, "asked");
  }

  /** What to ask once a history page of `items` is read into a room that now holds `held` lines (history.ts), in a room
   * this page asked alone; or none. */
  earlier(room: string, items: readonly IrcMessage[], held: number): string | undefined {
    return this.#phases.get(room) === "asked" ? this.#earlier.after(room, items, held) : undefined;
  }

  /** The rooms followed are now `wanted`: the dropped ones parted before the new ones are joined. */
  follow(wanted: readonly string[]): void {
    this.#sent(
      "PART",
      [...this.#phases.keys()].filter((room) => !wanted.includes(room)),
    );
    this.join(wanted.filter((room) => !this.#phases.has(room)));
  }

  /** A JOIN of these rooms, which marks them joined once it went. */
  join(rooms: readonly string[]): void {
    this.#sent("JOIN", rooms);
  }

  /** The connection ended: nothing joined, no room known to be in. */
  clear(): void {
    this.#phases.clear();
    this.inside.clear();
    this.#earlier.clear();
  }

  // A JOIN sent marks its rooms joined; a PART sent forgets them.
  #sent(command: "JOIN" | "PART", rooms: readonly string[]): void {
    for (const group of groupsOf(command, rooms)) {
      if (!this.#send(`${command} ${group.join(",")}`)) return;
      for (const room of group) {
        if (command === "PART") this.inside.delete(room);
        if (command === "JOIN") this.#phases.set(room, "joined");
        else this.#phases.delete(room);
      }
    }
  }
}
