// The chat's link to Ergo (slice 4's merge 4b): one connection for the page, as the session says (a guest
// when nobody is logged in, the account when one is), in the rooms the world page follows, 100 at most
// (Ergo's max-channels-per-client); the newest lines of the room in view alone, once Ergo says I joined it, since
// Ergo paces a client to 2 lines a second (plan §4); Ergo's lines read into the store through one BatchReader a
// connection. Its parts come in, so the tests give their own.
import { BatchReader, nickOf, type IrcMessage } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
import { LINES_KEPT } from "../../store/chat.ts";
import type { AppState, createAppStore } from "../../store/index.ts";

/** The rooms a connection joins: Ergo's max-channels-per-client (deploy/ergo/ircd.yaml.tmpl). */
export const ROOMS_JOINED = 100;
/** The lines a room's history asks: the store's window. */
export const HISTORY_LINES = LINES_KEPT;
const LINE_BYTES = 510;

export interface LinkDeps {
  store: ReturnType<typeof createAppStore>;
  connect: (who: Who, on: Pick<ErgoOptions, "onState" | "onLine">) => Ergo;
  ticket: () => Promise<Result<{ ticket: string }>>;
  guest: () => string;
}

export interface ChatLink {
  /** The rooms the world lists, in its order. */
  follow: (ids: readonly string[]) => void;
  /** The room in view: its history is asked once Ergo says I joined it, once a connection. */
  show: (room: string | undefined) => void;
  stop: () => void;
}

// Rooms in groups whose command line holds 510 bytes at most; a room id is ASCII, a character a byte.
function groupsOf(command: "JOIN" | "PART", rooms: readonly string[]): string[][] {
  const groups: string[][] = [];
  let size = 0;
  for (const room of rooms) {
    const last = groups.at(-1);
    if (last === undefined || size + 1 + room.length > LINE_BYTES) {
      groups.push([room]);
      size = command.length + 1 + room.length;
    } else {
      last.push(room);
      size += 1 + room.length;
    }
  }
  return groups;
}

// Where a room stands on this connection: a JOIN went for it; Ergo said, live, I joined it; its history went.
type Phase = "joined" | "inside" | "asked";

class Link implements ChatLink {
  readonly #deps: LinkDeps;
  readonly #unsubscribe: () => void;
  #key: string | undefined;
  #ergo: Ergo | undefined;
  #generation = 0;
  #stopped = false;
  #listed: readonly string[] = [];
  #shown: string | undefined;
  readonly #phases = new Map<string, Phase>();
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

  show(room: string | undefined): void {
    if (this.#stopped) return;
    this.#shown = room;
    this.#keep();
    if (room !== undefined) this.#history(room);
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#unsubscribe();
    this.#end();
    this.#deps.store.getState().loginActions.chat("off");
  }

  // The rooms followed: the first 100 listed, the room in view among them though listed past them (in place of
  // the 100th).
  #wanted(): readonly string[] {
    const shown = this.#shown;
    const first = this.#listed.slice(0, ROOMS_JOINED);
    const late = shown !== undefined && this.#listed.includes(shown) && !first.includes(shown);
    return late ? [...first.slice(0, ROOMS_JOINED - 1), shown] : first;
  }

  // The store told the rooms followed; the dropped ones parted before the new ones are joined (none while not
  // connected: Ergo's send then refuses).
  #keep(): void {
    const wanted = this.#wanted();
    this.#deps.store.getState().chatActions.follow(wanted);
    this.#send(
      "PART",
      [...this.#phases.keys()].filter((room) => !wanted.includes(room)),
    );
    this.#send(
      "JOIN",
      wanted.filter((room) => !this.#phases.has(room)),
    );
  }

  // A new session: the last connection ended, its rooms forgotten, and one opened as the session says. The store
  // never goes back to not knowing it.
  #follow(session: AppState["login"]["session"]): void {
    if (session.kind === "unknown") return;
    const key = session.kind === "out" ? "guest" : session.address;
    if (key === this.#key) return;
    // Another session than a known one starts with no room: a reader's rooms are its own, which the page lists
    // for it again.
    const known = this.#key !== undefined;
    // Noted first: the store's change below calls this again, which must find the session the same.
    this.#key = key;
    if (known) this.#unfollow();
    this.#end();
    const { ticket, guest } = this.#deps;
    this.#open(session.kind === "out" ? { guest } : { account: session.address, ticket });
  }

  #unfollow(): void {
    this.#listed = [];
    this.#shown = undefined;
    this.#deps.store.getState().chatActions.follow([]);
  }

  // The connection's end: its events ignored from now on, my nick and who is here forgotten.
  #end(): void {
    const ending = this.#ergo;
    this.#generation += 1;
    this.#ergo = undefined;
    this.#phases.clear();
    ending?.stop();
    this.#deps.store.getState().chatActions.disconnected();
  }

  #open(who: Who): void {
    const mine = this.#generation;
    this.#ergo = this.#deps.connect(who, {
      onState: (state) => {
        if (mine === this.#generation) this.#state(state);
      },
      onLine: (line) => {
        if (mine === this.#generation) this.#line(line);
      },
    });
  }

  // Connected: a new reader, my nick in the store, every room joined. Otherwise: nothing joined, nothing known.
  // Logged out: the session is gone, which the store hears, and the next connection is a guest's.
  #state(state: Parameters<ErgoOptions["onState"]>[0]): void {
    const { loginActions, chatActions } = this.#deps.store.getState();
    if (state === "logged-out") {
      loginActions.signedOut();
      return;
    }
    loginActions.chat(state);
    this.#phases.clear();
    if (state !== "connected") {
      chatActions.disconnected();
      return;
    }
    this.#reader = new BatchReader();
    chatActions.connected(this.#ergo?.nick() ?? "");
    this.#send("JOIN", this.#wanted());
  }

  // A room's newest lines, once Ergo said I joined it, once a connection.
  #history(room: string): void {
    if (this.#phases.get(room) !== "inside") return;
    this.#phases.set(room, "asked");
    this.#ergo?.send(`CHATHISTORY LATEST ${room} * ${String(HISTORY_LINES)}`);
  }

  // A JOIN sent marks its rooms joined; a PART sent forgets them.
  #send(command: "JOIN" | "PART", rooms: readonly string[]): void {
    for (const group of groupsOf(command, rooms)) {
      if (this.#ergo?.send(`${command} ${group.join(",")}`) !== true) return;
      for (const room of group) {
        if (command === "JOIN") this.#phases.set(room, "joined");
        else this.#phases.delete(room);
      }
    }
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
    if (command !== "JOIN" || tags.has("batch") || this.#phases.get(room) !== "joined") return;
    if (nickOf(source) !== this.#ergo?.nick()) return;
    this.#phases.set(room, "inside");
    if (room === this.#shown) this.#history(room);
  }
}

/** Links the page to Ergo, following the store's session, until stopped. */
export const chatLink = (deps: LinkDeps): ChatLink => new Link(deps);
