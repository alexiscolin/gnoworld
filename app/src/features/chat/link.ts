// The chat's link to Ergo (slice 4's merge 4b): one connection for the page, as the session says (a guest
// when nobody is logged in, the account when one is), in the rooms the world page follows, 100 at most
// (Ergo's max-channels-per-client); the newest lines of the room in view alone, once Ergo says I joined it, since
// Ergo paces a client to 2 lines a second (plan §4); Ergo's lines read into the store through one BatchReader a
// connection. Its parts come in, so the tests give their own.
import { BatchReader, compose, nickOf, type IrcMessage } from "@gnoworld/core";
import { Address, RoomId } from "@gnoworld/schemas";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
import { LINES_KEPT } from "../../store/chat.ts";
import type { AppState } from "../../store/index.ts";
import { asksAfterJoin, followed, groupsOf, outOf } from "./groups.ts";
import type { ChatLink, LinkDeps } from "./linkTypes.ts";
import { outbox, type Outbox } from "./outbox.ts";
import { beginSession, heardBy } from "./session.ts";
import { Places, TypingOut } from "./telling.ts";

/** The rooms a connection joins: Ergo's max-channels-per-client (deploy/ergo/ircd.yaml.tmpl). */
export const ROOMS_JOINED = 100;
/** The lines a room's history asks: the store's window. */
export const HISTORY_LINES = LINES_KEPT;
// A msgid: one word of 64 characters at most (Ergo's are 26), no space, comma, NUL or leading colon.
const MSGID = /^[^\s,:\0][^\s,\0]{0,63}$/;

export type { ChatLink, LinkDeps };

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
  readonly #outbox: Outbox;
  #reader = new BatchReader();
  readonly #typing = new TypingOut();
  readonly #out = (line: string): boolean => this.#ergo?.send(line) === true;
  readonly #places = new Places((room) => this.#deps.store.getState().chat.rooms[room]?.read, this.#out);

  constructor(deps: LinkDeps) {
    this.#deps = deps;
    this.#outbox = outbox(deps.store);
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
    if (this.#shown !== undefined && room !== this.#shown) this.#places.flush(this.#shown);
    this.#shown = room;
    this.#keep();
  }

  say(room: string, draft: string): boolean {
    const line = this.#lineTo(room, draft, () => this.#inside.has(room));
    const went = line !== undefined && this.#ergo?.send(line) === true;
    if (went) this.#typing.ended(room);
    return went;
  }

  // Labeled, so Ergo's answer names it (CR1); the label rides within the bytes compose leaves for Ergo's relay.
  sayTo(partner: string, draft: string): boolean {
    const line = this.#lineTo(partner, draft, (me) => me !== partner && Address.safeParse(partner).success);
    if (line === undefined) return false;
    return this.#outbox.send(partner, draft, (label) => this.#ergo?.send(`@label=${label} ${line}`) === true);
  }

  // The line a draft to `target` composes to, on an account's connection when `allowed` lets it, given my nick.
  #lineTo(target: string, draft: string, allowed: (me: string) => boolean): string | undefined {
    const me = this.#ergo?.nick();
    if (this.#key === "guest" || me === undefined || !allowed(me)) return undefined;
    const composed = compose(target, draft, me);
    return composed.kind === "line" ? composed.line : undefined;
  }

  redact(room: string, id: string): boolean {
    const allowed = this.#key !== "guest" && this.#inside.has(room) && MSGID.test(id);
    return allowed && this.#ergo?.send(`REDACT ${room} ${id}`) === true;
  }

  typing(room: string, state: "active" | "done"): void {
    if (this.#key !== "guest" && this.#inside.has(room)) this.#typing.tell(room, state, this.#out);
  }

  read(room: string, id: string): void {
    const line = this.#deps.store.getState().chat.rooms[room]?.lines.findLast((each) => each.id === id);
    if (this.#key !== "guest" && room === this.#shown && line !== undefined) this.#places.ask(room, line.time);
    if (this.#inside.has(room)) this.#places.tell(room);
  }

  flush(): void {
    this.#places.flush();
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#unsubscribe();
    this.#end();
    this.#deps.store.getState().loginActions.chat("off");
  }

  // The store told the rooms followed; the dropped ones parted before the new ones are joined (none while not
  // connected: Ergo's send then refuses).
  #keep(): void {
    const wanted = followed(this.#listed, this.#shown, ROOMS_JOINED);
    const parted = [...this.#phases.keys()].filter((room) => !wanted.includes(room));
    const joined = wanted.filter((room) => !this.#phases.has(room));
    this.#deps.store.getState().chatActions.follow(wanted);
    this.#send("PART", parted);
    this.#send("JOIN", joined);
    this.#history(this.#shown);
  }

  // A new session: the last connection ended, its rooms and direct messages forgotten, and one opened as the session
  // says. The store never goes back to not knowing it.
  #follow(session: AppState["login"]["session"]): void {
    if (session.kind === "unknown") return;
    const key = session.kind === "out" ? "guest" : session.address;
    if (key === this.#key) return;
    // Another session than a known one starts with no room: a reader's rooms are its own, which the page lists
    // for it again.
    const known = this.#key !== undefined;
    // Noted first: the store's change below calls this again, which must find the session the same.
    this.#key = key;
    const { store, ticket, guest } = this.#deps;
    if (known) {
      this.#listed = [];
      this.#shown = undefined;
      this.#places.forget();
      store.getState().chatActions.follow([]);
    }
    beginSession(this.#deps, session);
    this.#end();
    this.#open(session.kind === "out" ? { guest } : { account: session.address, ticket });
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
    this.#send("JOIN", followed(this.#listed, this.#shown, ROOMS_JOINED));
    this.#history(this.#shown);
  }

  #forget(): void {
    this.#phases.clear();
    this.#inside.clear();
    this.#typing.forget();
    this.#places.reconnected();
    this.#outbox.clear();
  }

  // The room in view's newest lines, once joined by this page and Ergo said I am in it, once a connection.
  #history(room: string | undefined): void {
    if (room === undefined || !this.#inside.has(room) || this.#phases.get(room) !== "joined") return;
    this.#phases.set(room, "asked");
    this.#ergo?.send(`CHATHISTORY LATEST ${room} * ${String(HISTORY_LINES)}`);
    const held = this.#deps.store.getState().chat.rooms[room];
    for (const ask of asksAfterJoin(room, held, this.#key !== "guest")) this.#ergo?.send(ask);
  }

  // A JOIN sent marks its rooms joined; a PART sent forgets them.
  #send(command: "JOIN" | "PART", rooms: readonly string[]): void {
    for (const group of groupsOf(command, rooms)) {
      if (this.#ergo?.send(`${command} ${group.join(",")}`) !== true) return;
      for (const room of group) {
        if (command === "PART") this.#inside.delete(room);
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
    const { type, params, tags, messages } = read.batch;
    if (type === "chathistory") this.#deps.store.getState().chatActions.page(params[0] ?? "", messages);
    else for (const each of messages) this.#heard(each);
    if (type === "labeled-response") this.#outbox.answered(tags, messages);
  }

  // Ergo's JOIN of me, not replayed: I am in that room, its lines asked, its place told; a line taking me out: out of it.
  #heard(message: IrcMessage): void {
    heardBy(this.#deps.store, message);
    // A labeled-response batch's lines carry no label: the batch's own line does, read at its end (#line).
    this.#outbox.answered(message.tags, [message]);
    const { tags, source = "", command, params } = message;
    const [room = ""] = params;
    const me = this.#ergo?.nick();
    if (tags.has("batch") || me === undefined) return;
    if (outOf(message, me)) this.#inside.delete(room);
    if (command !== "JOIN" || nickOf(source) !== me) return;
    this.#inside.add(room);
    this.#history(this.#shown);
    this.#places.tell(room, true);
  }
}

/** Links the page to Ergo, following the store's session, until stopped. */
export const chatLink = (deps: LinkDeps): ChatLink => new Link(deps);
