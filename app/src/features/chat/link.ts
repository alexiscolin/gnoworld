// The chat's link to Ergo (slice 4's merge 4b): one connection for the page, as the session says (a guest
// when nobody is logged in, the account when one is), in the rooms the world page follows, 100 at most
// (Ergo's max-channels-per-client); the newest lines of the room in view alone, once Ergo says I joined it, since
// Ergo paces a client to 2 lines a second (plan §4); Ergo's lines read into the store through one BatchReader a
// connection. Its parts come in, so the tests give their own.
import { BatchReader, type IrcMessage } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
import type { AppState } from "../../store/index.ts";
import { asksAfterJoin, followed, joined, outOf } from "./groups.ts";
import { HISTORY_LINES } from "./history.ts";
import { Joins } from "./joins.ts";
import type { ChatLink, LinkDeps } from "./linkTypes.ts";
import { heardIn } from "./outgoing.ts";
import { Kitting } from "./kitting.ts";
import { beginSession, heardBy } from "./session.ts";

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
  #reader = new BatchReader();
  readonly #out = (line: string): boolean => this.#ergo?.send(line) === true;
  readonly #joins = new Joins(this.#out);
  readonly #inside = this.#joins.inside;
  // An account's half (accountKit.ts), made as an account connects: none for a guest's link, which has no use for it.
  readonly #kitting: Kitting;
  get #kit() {
    return this.#kitting.kit;
  }

  constructor(deps: LinkDeps) {
    this.#deps = deps;
    this.#kitting = new Kitting(
      { store: deps.store, ergo: () => this.#ergo, key: () => this.#key, out: this.#out, inside: this.#inside },
      { made: deps.kit, load: deps.loadKit },
    );
    this.#unsubscribe = deps.store.subscribe((state) => {
      this.#follow(state.login.session);
    });
    this.#follow(deps.store.getState().login.session);
  }

  follow(ids: readonly string[], groupRooms: readonly string[] = []): void {
    if (this.#stopped) return;
    this.#kitting.groups(new Set(groupRooms));
    this.#listed = [...new Set(ids.filter((id) => RoomId.safeParse(id).success))];
    this.#keep();
  }

  show(room: string | undefined): void {
    if (this.#stopped) return;
    if (this.#shown !== undefined && room !== this.#shown) this.#kit?.places.flush(this.#shown);
    this.#shown = room;
    this.#keep();
  }

  // Yes while Ergo has no nick yet (its answer is unknown then): no refusal before the welcome; read at each render.
  readonly multiline = (): boolean => this.#ergo?.multiline() ?? true;

  readonly say: ChatLink["say"] = (...args) => this.#kit?.speaking.say(...args) ?? false;
  readonly slow: ChatLink["slow"] = (composed) => this.#kit?.speaking.slow(composed);
  readonly correct: ChatLink["correct"] = (...args) => this.#kit?.speaking.correct(...args) ?? false;
  readonly sayTo: ChatLink["sayTo"] = (...args) => this.#kit?.speaking.sayTo(...args) ?? false;
  readonly reactTo: ChatLink["reactTo"] = (...args) => this.#kit?.speaking.reactTo(...args) ?? false;
  readonly redactIn: ChatLink["redactIn"] = (...args) => this.#kit?.speaking.redactIn(...args) ?? false;
  readonly redact: ChatLink["redact"] = (...args) => this.#kit?.speaking.redact(...args) ?? false;
  readonly react: ChatLink["react"] = (...args) => this.#kit?.speaking.react(...args) ?? false;

  readonly typing: ChatLink["typing"] = (...args) => this.#kit?.speaking.typing(...args);

  read(room: string, id: string): void {
    const line = this.#deps.store.getState().chat.rooms[room]?.lines.findLast((each) => each.id === id);
    const marked = this.#key !== "guest" && room === this.#shown ? line : undefined;
    if (marked !== undefined) this.#deps.store.getState().noticeActions.seen(room, marked.time);
    this.markRead(room, marked?.time);
  }

  // The place asked for a room, an account's alone, and told once Ergo says I am in it; no new place only tells the last.
  markRead(room: string, time?: string): void {
    if (time !== undefined && this.#key !== "guest") this.#kit?.places.ask(room, time);
    if (this.#inside.has(room)) this.#kit?.places.tell(room);
  }

  readonly flush = (): void => this.#kit?.places.flush();

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
    // Another session than a known one starts with no room: a reader's rooms are its own, which the page lists for it
    // again; the store has already forgotten the last one's (its own subscriber), the link's are its own.
    const known = this.#key !== undefined;
    // Noted first: the store's change below calls this again, which must find the session the same.
    this.#key = key;
    const { ticket, guest } = this.#deps;
    if (known) {
      this.#listed = [];
      this.#shown = undefined;
      this.#kit?.places.forget();
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

  // An account's connection waits for its half's code, asked once (kitting.ts).
  #open(who: Who): void {
    const mine = this.#generation;
    this.#kitting.connectWhen(
      "account" in who,
      () => mine === this.#generation,
      () => {
        this.#connect(who);
      },
    );
  }

  #connect(who: Who): void {
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
    this.#kit?.forgot();
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
    else for (const each of heardIn(read.batch)) this.#heard(each);
    if (type === "labeled-response") this.#kit?.outbox.answered(tags, messages);
  }

  // A history page to the store at once; then, in a room this page asked, the items before its oldest when the page
  // leaves the window short of lines (history.ts).
  #page(room: string, messages: readonly IrcMessage[]): void {
    const store = this.#deps.store;
    store.getState().chatActions.page(room, messages);
    this.#kit?.paged(room, messages);
    const earlier = this.#joins.earlier(room, messages, store.getState().chat.rooms[room]?.lines.length ?? 0);
    if (earlier !== undefined) this.#out(earlier);
  }

  // Ergo's JOIN of me, not replayed: I am in that room, its lines asked, its place told; a line taking me out: out of it.
  #heard(message: IrcMessage): void {
    heardBy(this.#deps.store, message);
    this.#kit?.heard(message);
    const me = this.#ergo?.nick();
    if (message.tags.has("batch") || me === undefined) return;
    const room = message.params[0] ?? "";
    if (outOf(message, me)) this.#inside.delete(room);
    if (!joined(message, me)) return;
    this.#inside.add(room);
    this.#history(this.#shown);
    this.#kit?.places.tell(room, true);
  }
}

/** Links the page to Ergo, following the store's session, until stopped. */
export const chatLink = (deps: LinkDeps): ChatLink => new Link(deps);
