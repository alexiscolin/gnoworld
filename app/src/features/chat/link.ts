// The chat's link to Ergo (slice 4's merge 4b): one connection for the page, as the session says (a guest
// when nobody is logged in, the account when one is), in the rooms the world page follows, 100 at most
// (Ergo's max-channels-per-client); the newest lines of the room in view alone, once Ergo says I joined it, since
// Ergo paces a client to 2 lines a second (plan §4); Ergo's lines read into the store through one BatchReader a
// connection. Its parts come in, so the tests give their own.
import { BatchReader, nickOf, reactionLine, type IrcMessage, type Reacting } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
import type { AppState } from "../../store/index.ts";
import { asksAfterJoin, followed, outOf } from "./groups.ts";
import { HISTORY_LINES } from "./history.ts";
import { reactTo as reactIn, redactFrom, redactIn, sayTo as sayIn, speakIn, type DmOut } from "./dmOut.ts";
import { Joins } from "./joins.ts";
import type { ChatLink, LinkDeps } from "./linkTypes.ts";
import { outbox, type Outbox } from "./outbox.ts";
import { reactLabel, refusedIn } from "./reacting.ts";
import { Places, TypingOut } from "./telling.ts";

/** The rooms a connection joins: Ergo's max-channels-per-client (deploy/ergo/ircd.yaml.tmpl). */
export const ROOMS_JOINED = 100;
export { HISTORY_LINES } from "./history.ts";

export type { ChatLink, LinkDeps };

class Link implements ChatLink {
  readonly #deps: LinkDeps;
  readonly #unsubscribe: () => void;
  #key: string | undefined;
  #ergo: Ergo | undefined;
  #generation = 0;
  #stopped = false;
  #listed: readonly string[] = [];
  #shown: string | undefined;
  readonly #outbox: Outbox;
  #reader = new BatchReader();
  readonly #typing = new TypingOut();
  readonly #out = (line: string): boolean => this.#ergo?.send(line) === true;
  readonly #joins = new Joins(this.#out);
  readonly #inside = this.#joins.inside;
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

  say(room: string, draft: string, reply?: string): boolean {
    return this.#speak(room, draft, { reply });
  }

  correct(room: string, draft: string, edit: string): boolean {
    return this.#speak(room, draft, { edit });
  }

  #speak(room: string, draft: string, tags: { reply?: string | undefined; edit?: string | undefined }): boolean {
    const went = speakIn(this.#dm(), { room, draft, inside: this.#inside.has(room) }, tags);
    if (went) this.#typing.ended(room);
    return went;
  }

  sayTo(partner: string, draft: string, tags?: { reply?: string; edit?: string }): boolean {
    return sayIn(this.#dm(), { partner, draft }, tags);
  }

  reactTo = (partner: string, reaction: Reacting): boolean => reactIn(this.#dm(), partner, reaction);

  redactIn = (partner: string, id: string): boolean => redactIn(this.#dm(), partner, id);

  // What a direct message's lines are sent with (dmOut.ts).
  #dm(): DmOut {
    return { ergo: this.#ergo, key: this.#key, outbox: this.#outbox, store: this.#deps.store };
  }

  redact(room: string, id: string): boolean {
    return redactFrom(this.#dm(), { room, id, inside: this.#inside.has(room) });
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

  react(room: string, reaction: Reacting): boolean {
    const line = reactionLine(reaction, room, reactLabel(room));
    return line !== undefined && this.#key !== "guest" && this.#inside.has(room) && this.#out(line);
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
    this.#joins.follow(wanted);
    this.#deps.store.getState().chatActions.follow(wanted);
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
    const { store, device, ticket, guest } = this.#deps;
    if (known) {
      this.#listed = [];
      this.#shown = undefined;
      this.#places.forget();
      store.getState().chatActions.follow([]);
    }
    store.getState().dmActions.begin(session.kind === "in" ? device?.(session.address) : undefined);
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
    this.#joins.join(followed(this.#listed, this.#shown, ROOMS_JOINED));
    this.#history(this.#shown);
  }

  #forget(): void {
    this.#joins.clear();
    this.#typing.forget();
    this.#places.reconnected();
    this.#outbox.clear();
  }

  // The room in view's newest lines, once joined by this page and Ergo said I am in it, once a connection.
  #history(room: string | undefined): void {
    if (room === undefined || !this.#inside.has(room) || this.#joins.phase(room) !== "joined") return;
    this.#joins.asked(room);
    this.#ergo?.send(`CHATHISTORY LATEST ${room} * ${String(HISTORY_LINES)}`);
    const held = this.#deps.store.getState().chat.rooms[room];
    for (const ask of asksAfterJoin(room, held, this.#key !== "guest")) this.#ergo?.send(ask);
  }

  // A live line to the store; a history page to it at once at its end; another batch's lines one by one.
  #line(message: IrcMessage): void {
    const read = this.#reader.read(message);
    if (read.kind === "pass") this.#heard(message);
    if (read.kind !== "done") return;
    const { type, params, tags, messages } = read.batch;
    if (type === "chathistory") this.#page(params[0] ?? "", messages);
    else for (const each of messages) this.#heard(each);
    if (type === "labeled-response") this.#outbox.answered(tags, messages);
  }

  // A history page to the store at once; then, in a room this page asked, the items before its oldest when the page
  // leaves the window short of lines (history.ts).
  #page(room: string, messages: readonly IrcMessage[]): void {
    const store = this.#deps.store;
    store.getState().chatActions.page(room, messages);
    const earlier = this.#joins.earlier(room, messages, store.getState().chat.rooms[room]?.lines.length ?? 0);
    if (earlier !== undefined) this.#out(earlier);
  }

  // Ergo's JOIN of me, not replayed: I am in that room, its lines asked, its place told; a line taking me out: out of it.
  #heard(message: IrcMessage): void {
    const { chatActions, dmActions } = this.#deps.store.getState();
    chatActions.heard(message);
    dmActions.heard(message);
    // A labeled-response batch's lines carry no label: the batch's own line does, read at its end (#line).
    this.#outbox.answered(message.tags, [message]);
    const { tags, source = "", command, params } = message;
    const refused = refusedIn(message);
    if (refused !== undefined) chatActions.reactionRefused(refused);
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
