// The chat's link to Ergo (slice 4's merge 4b): one connection for the page, as the session says (a guest
// when nobody is logged in, the account when one is), in the rooms the world page follows, 100 at most
// (Ergo's max-channels-per-client); the newest lines of the room in view alone, once Ergo says I joined it, since
// Ergo paces a client to 2 lines a second (plan §4); Ergo's lines read into the store through one BatchReader a
// connection. Its parts come in, so the tests give their own.
import { BatchReader, compose, nickOf, reactionLine, type IrcMessage, type Reacting } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
import { LINES_KEPT } from "../../store/chat.ts";
import { groupsOf } from "./groups.ts";
import { Labels } from "./labels.ts";
import type { AppState, createAppStore } from "../../store/index.ts";

/** The rooms a connection joins: Ergo's max-channels-per-client (deploy/ergo/ircd.yaml.tmpl). */
export const ROOMS_JOINED = 100;
/** The lines a room's history asks: the store's window. */
export const HISTORY_LINES = LINES_KEPT;
// A msgid: one word of 64 characters at most (Ergo's are 26), no space, comma, NUL or leading colon.
const MSGID = /^[^\s,:\0][^\s,\0]{0,63}$/;

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
  /** Sends a draft, as the composer composes it, to a room Ergo says it is in; an account's alone. Whether it went. */
  say: (room: string, draft: string) => boolean;
  /** Deletes a line, by its msgid, in a room Ergo says it is in, as Ergo's REDACT (4c's message menu); an
   * account's alone, Ergo refusing another's line. Whether it went. */
  redact: (room: string, id: string) => boolean;
  /** Reacts to a line of a room Ergo says it is in, by its msgid, with one emoji of RGI's set, or takes the reaction
   * back (4d); an account's alone. Each is labelled, so Ergo's answer to it is known. Whether it went. */
  react: (room: string, reaction: Reacting) => boolean;
  stop: () => void;
}

// Where a room this page follows stands on this connection: a JOIN went for it; its history went.
type Phase = "joined" | "asked";

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
  // The rooms Ergo said, live, I am in on this connection, joined by this page or not: with Ergo's multiclient a
  // second tab's own JOIN brings no echo, Ergo having told it of the room at its welcome or as the first joined.
  readonly #inside = new Set<string>();
  #reader = new BatchReader();
  readonly #labels = new Labels();

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
  }

  say(room: string, draft: string): boolean {
    const me = this.#ergo?.nick();
    if (this.#key === "guest" || me === undefined || !this.#inside.has(room)) return false;
    const composed = compose(room, draft, me);
    return composed.kind === "line" && this.#ergo?.send(composed.line) === true;
  }

  redact(room: string, id: string): boolean {
    const allowed = this.#key !== "guest" && this.#inside.has(room) && MSGID.test(id);
    return allowed && this.#ergo?.nick() !== undefined && this.#ergo.send(`REDACT ${room} ${id}`);
  }

  react(room: string, reaction: Reacting): boolean {
    const line = reactionLine(reaction, room, this.#labels.next());
    if (line === undefined || this.#key === "guest" || !this.#inside.has(room)) return false;
    if (this.#ergo?.nick() === undefined || !this.#ergo.send(line)) return false;
    this.#labels.sent(room);
    return true;
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
    this.#history(this.#shown);
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
    this.#forget();
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
    this.#forget();
    if (state !== "connected") {
      chatActions.disconnected();
      return;
    }
    this.#reader = new BatchReader();
    chatActions.connected(this.#ergo?.nick() ?? "");
    this.#send("JOIN", this.#wanted());
    this.#history(this.#shown);
  }

  #forget(): void {
    this.#phases.clear();
    this.#inside.clear();
    this.#labels.clear();
  }

  // The room in view's newest lines, once joined by this page and Ergo said I am in it, once a connection.
  #history(room: string | undefined): void {
    if (room === undefined || !this.#inside.has(room) || this.#phases.get(room) !== "joined") return;
    this.#phases.set(room, "asked");
    this.#ergo?.send(`CHATHISTORY LATEST ${room} * ${String(HISTORY_LINES)}`);
    // An echoed JOIN brings Ergo's NAMES and puts me in the store's list; a second tab's brings neither.
    const here = this.#deps.store.getState().chat.rooms[room]?.members.length ?? 0;
    if (here === 0) this.#ergo?.send(`NAMES ${room}`);
  }

  // A JOIN sent marks its rooms joined; a PART sent forgets them.
  #send(command: "JOIN" | "PART", rooms: readonly string[]): void {
    for (const group of groupsOf(command, rooms)) {
      if (this.#ergo?.send(`${command} ${group.join(",")}`) !== true) return;
      for (const room of group) {
        if (command === "JOIN") {
          this.#phases.set(room, "joined");
        } else {
          this.#phases.delete(room);
          this.#inside.delete(room);
        }
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

  // Ergo's JOIN of me, not replayed: I am in that room, and the room in view's lines are asked. Its KICK of me: I
  // am in it no more, and say nothing there.
  #heard(message: IrcMessage): void {
    this.#deps.store.getState().chatActions.heard(message);
    const { tags, source = "", command, params } = message;
    this.#labels.answered(tags.get("label"), command, this.#deps.store.getState().chatActions.reactionRefused);
    const [room = "", kicked] = params;
    const me = this.#ergo?.nick();
    if (tags.has("batch") || me === undefined) return;
    if (command === "KICK" && kicked === me) this.#inside.delete(room);
    if (command !== "JOIN" || nickOf(source) !== me) return;
    this.#inside.add(room);
    this.#history(this.#shown);
  }
}

/** Links the page to Ergo, following the store's session, until stopped. */
export const chatLink = (deps: LinkDeps): ChatLink => new Link(deps);
