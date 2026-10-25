// The chat's link to Ergo (slice 4's merge 4b): one connection for the page, as the session says (a guest
// when nobody is logged in, the account when one is), in the rooms the world page follows, 100 at most
// (Ergo's max-channels-per-client); the newest lines of the room in view alone, once Ergo says I joined it, since
// Ergo paces a client to 2 lines a second (plan §4); Ergo's lines read into the store through one BatchReader a
// connection. Its parts come in, so the tests give their own.
import { BatchReader, type IrcMessage } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoState, Who } from "../../lib/ergo/ergo.ts";
import type { AppState, createAppStore } from "../../store/index.ts";

/** The rooms a connection joins: Ergo's max-channels-per-client (deploy/ergo/ircd.yaml.tmpl). */
export const ROOMS_JOINED = 100;
/** The lines a room's history asks: the store's window. */
export const HISTORY_LINES = 200;
const LINE_BYTES = 510;

export interface LinkDeps {
  store: ReturnType<typeof createAppStore>;
  connect: (who: Who, on: { onState: (state: ErgoState) => void; onLine: (line: IrcMessage) => void }) => Ergo;
  ticket: () => Promise<Result<{ ticket: string }>>;
  guest: () => string;
}

// A command naming these rooms, in lines of 510 bytes at most; a room id is ASCII, a character a byte.
function linesOf(command: "JOIN" | "PART", rooms: readonly string[]): string[] {
  const lines: string[][] = [];
  let size = 0;
  for (const room of rooms) {
    const last = lines.at(-1);
    if (last === undefined || size + 1 + room.length > LINE_BYTES) {
      lines.push([room]);
      size = command.length + 1 + room.length;
    } else {
      last.push(room);
      size += 1 + room.length;
    }
  }
  return lines.map((names) => `${command} ${names.join(",")}`);
}

// Who a session connects as, by a key that changes when the connection must: none before it is known.
function keyOf(session: AppState["login"]["session"]): string | undefined {
  if (session.kind === "unknown") return undefined;
  return session.kind === "out" ? "guest" : `account:${session.address}`;
}

const nickOf = (source: string): string => source.replace(/[!@].*$/s, "");

class Link {
  readonly #deps: LinkDeps;
  readonly #unsubscribe: () => void;
  #key: string | undefined;
  #ergo: Ergo | undefined;
  #generation = 0;
  #connected = false;
  #stopped = false;
  #listed: readonly string[] = [];
  #rooms: readonly string[] = [];
  // The rooms a JOIN went for; those Ergo said I joined, live; those whose history went: each this connection's.
  readonly #joined = new Set<string>();
  readonly #inside = new Set<string>();
  readonly #asked = new Set<string>();
  #shown: string | undefined;
  #reader = new BatchReader();

  constructor(deps: LinkDeps) {
    this.#deps = deps;
    this.#unsubscribe = deps.store.subscribe((state) => {
      this.#follow(state.login.session);
    });
    this.#follow(deps.store.getState().login.session);
  }

  follow(ids: readonly string[]): void {
    if (this.#stopped) return;
    this.#listed = [...new Set(ids.filter((id) => RoomId.safeParse(id).success))];
    this.#keep();
  }

  /** The room in view: its history is asked once Ergo says I joined it, once a connection. */
  show(room: string | undefined): void {
    if (this.#stopped) return;
    this.#shown = room;
    this.#keep();
    if (room !== undefined && this.#inside.has(room)) this.#history(room);
  }

  // The rooms followed: the first 100 listed, the room in view among them though listed past them (in place of
  // the 100th); the store told, and while connected, the dropped ones parted before the new ones are joined.
  #keep(): void {
    const shown = this.#shown;
    const first = this.#listed.slice(0, ROOMS_JOINED);
    const late = shown !== undefined && this.#listed.includes(shown) && !first.includes(shown);
    const wanted = late ? [...first.slice(0, ROOMS_JOINED - 1), shown] : first;
    this.#rooms = wanted;
    this.#deps.store.getState().chatActions.follow(wanted);
    if (!this.#connected) return;
    this.#send(
      "PART",
      [...this.#joined].filter((room) => !wanted.includes(room)),
    );
    this.#send(
      "JOIN",
      wanted.filter((room) => !this.#joined.has(room)),
    );
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#unsubscribe();
    this.#end();
    this.#deps.store.getState().loginActions.chat("off");
  }

  // A new session: the last connection ended, and one opened as the session says. The store never goes back
  // to not knowing it.
  #follow(session: AppState["login"]["session"]): void {
    const key = keyOf(session);
    if (session.kind === "unknown" || key === this.#key) return;
    this.#key = key;
    this.#end();
    const { ticket, guest } = this.#deps;
    this.#open(session.kind === "out" ? { guest } : { account: session.address, ticket });
  }

  // The connection's end: its events ignored from now on, my nick and who is here forgotten.
  #end(): void {
    const ending = this.#ergo;
    this.#generation += 1;
    this.#ergo = undefined;
    this.#connected = false;
    this.#forget();
    ending?.stop();
    this.#deps.store.getState().chatActions.disconnected();
  }

  #open(who: Who): void {
    const mine = this.#generation;
    const ergo = this.#deps.connect(who, {
      onState: (state) => {
        if (mine === this.#generation) this.#state(state);
      },
      onLine: (line) => {
        if (mine === this.#generation) this.#line(line);
      },
    });
    this.#ergo = ergo;
  }

  // Connected: a new reader, my nick in the store, every room joined. Otherwise: nothing joined, nothing known.
  // Logged out: the session is gone, which the store hears, and the next connection is a guest's.
  #state(state: ErgoState): void {
    const { loginActions, chatActions } = this.#deps.store.getState();
    if (state === "logged-out") {
      loginActions.signedOut();
      return;
    }
    loginActions.chat(state);
    this.#connected = state === "connected";
    this.#forget();
    if (!this.#connected) {
      chatActions.disconnected();
      return;
    }
    this.#reader = new BatchReader();
    chatActions.connected(this.#ergo?.nick() ?? "");
    this.#send("JOIN", this.#rooms);
  }

  #forget(): void {
    for (const rooms of [this.#joined, this.#inside, this.#asked]) rooms.clear();
  }

  #history(room: string): void {
    if (this.#asked.has(room)) return;
    this.#asked.add(room);
    this.#ergo?.send(`CHATHISTORY LATEST ${room} * ${String(HISTORY_LINES)}`);
  }

  #send(command: "JOIN" | "PART", rooms: readonly string[]): void {
    for (const line of linesOf(command, rooms)) {
      if (this.#ergo?.send(line) !== true) return;
      for (const room of line.slice(command.length + 1).split(",")) this.#sent(command, room);
    }
  }

  // A JOIN sent; a PART sent, after which the room is neither joined, nor inside, nor asked.
  #sent(command: "JOIN" | "PART", room: string): void {
    if (command === "JOIN") this.#joined.add(room);
    else for (const rooms of [this.#joined, this.#inside, this.#asked]) rooms.delete(room);
  }

  // A live line to the store; a history page to it at once at its end; another batch's lines one by one.
  #line(message: IrcMessage): void {
    const read = this.#reader.read(message);
    if (read.kind === "pass") this.#heard(message);
    if (read.kind !== "done") return;
    const { type, params, messages } = read.batch;
    if (type === "chathistory") this.#deps.store.getState().chatActions.page(params[0] ?? "", messages);
    else for (const each of messages) this.#heard(each);
  }

  // Ergo's JOIN of me to a room joined, not replayed: I am inside, and the room in view's lines are asked.
  #heard(message: IrcMessage): void {
    this.#deps.store.getState().chatActions.heard(message);
    const { tags, source = "", command, params } = message;
    const [room = ""] = params;
    const mine = nickOf(source) === this.#ergo?.nick();
    if (command !== "JOIN" || !mine || tags.has("batch") || !this.#joined.has(room)) return;
    this.#inside.add(room);
    if (room === this.#shown) this.#history(room);
  }
}

/** Links the page to Ergo, following the store's session, until stopped. */
export function chatLink(deps: LinkDeps): {
  follow: (ids: readonly string[]) => void;
  show: (room: string | undefined) => void;
  stop: () => void;
} {
  const link = new Link(deps);
  return {
    follow: (ids) => {
      link.follow(ids);
    },
    show: (room) => {
      link.show(room);
    },
    stop: () => {
      link.stop();
    },
  };
}
