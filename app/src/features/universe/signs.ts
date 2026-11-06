// What the Earth shows over its globe, from the store to the page: the rules' pick when a line comes and once a second, never on a frame
// (docs/plans/slice-6.md §4). No React, so the component only reads a snapshot.
import {
  bubbleLines,
  countryTrends,
  isPublicRoom,
  pickBubbles,
  turnTo,
  type Bubble,
  type Count,
  type EarthRoom,
  type Rules,
  type Trend,
} from "@gnoworld/core/bubbles";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Ground } from "../../scene/earth/marks.ts";
import type { AppState } from "../../store/index.ts";
import { own } from "../../store/record.ts";

/** A side room on the globe. */
export interface Pin {
  readonly room: string;
  readonly label: string;
  /** Its address on this page. */
  readonly href: string;
  readonly lat: number;
  readonly lon: number;
}

export interface Snapshot {
  readonly bubbles: readonly Bubble[];
  readonly counts: readonly Count[];
  readonly trends: readonly Trend[];
  readonly pins: readonly Pin[];
}

export interface SignsDeps {
  readonly store: StoreApi<AppState>;
  readonly ground: Ground;
  readonly rules: Rules;
  /** Where the side rooms stand (app/data/earthRooms.json). */
  readonly places: readonly { readonly room: string; readonly lat: number; readonly lon: number }[];
}

const NOTHING: Snapshot = { bubbles: [], counts: [], trends: [], pins: [] };
const SECOND = 1000;
// Every row of the data file is #earth/<name> (EarthRooms, packages/schemas).
const SIDE_ROOM = "#earth/";
const TWO_HOURS = 7_200_000;

// A trend needs both hours whole: a room's window that stops short of them undercounts the hour before.
const reaches = ({ lines: [oldest] }: EarthRoom, now: number): boolean =>
  oldest !== undefined && Date.parse(oldest.time) <= now - TWO_HOURS;

// Whether a change of the store moves what the rules read: typing, joins and the rest of a room's life do not.
function linesMoved({ chat, verdicts }: AppState, before: AppState): boolean {
  if (verdicts !== before.verdicts || chat.me !== before.chat.me || chat.listed !== before.chat.listed) return true;
  const rooms = Object.entries(chat.rooms);
  return (
    rooms.length !== Object.keys(before.chat.rooms).length ||
    rooms.some(([id, room]) => room.lines !== own(before.chat.rooms, id)?.lines)
  );
}

export class Signs {
  readonly #deps: SignsDeps;
  readonly #state = createStore<Snapshot>(() => NOTHING);
  #said = JSON.stringify(NOTHING);
  #shown: readonly Bubble[] = [];
  #faced: ReadonlySet<string> = new Set();

  constructor(deps: SignsDeps) {
    this.#deps = deps;
  }

  readonly subscribe = this.#state.subscribe;

  readonly snapshot = this.#state.getState;

  /** Starts it; what this returns stops it. */
  start(): () => void {
    const stopHearing = this.#deps.store.subscribe((state, before) => {
      if (!document.hidden && linesMoved(state, before)) this.#pick();
    });
    const timer = setInterval(this.#second, SECOND);
    this.#pick();
    return () => {
      clearInterval(timer);
      stopHearing();
    };
  }

  readonly #second = (): void => {
    if (!document.hidden) this.#pick();
  };

  #types(): ReadonlyMap<string, string> {
    const { listed = [] } = this.#deps.store.getState().chat;
    return new Map(listed.flatMap((section) => section.rooms).map(({ room, type }) => [room, type]));
  }

  #rooms(): EarthRoom[] {
    const { chat, verdicts } = this.#deps.store.getState();
    const types = this.#types();
    return Object.entries(chat.rooms).map(([room, { lines }]) => ({
      type: types.get(room),
      lines,
      hidden: (id) => own(own(verdicts, room) ?? {}, id) === "hidden",
    }));
  }

  #pins(): Pin[] {
    const types = this.#types();
    return this.#deps.places
      .filter(({ room }) => isPublicRoom(types.get(room)))
      .map(({ room, lat, lon }) => {
        const name = room.slice(SIDE_ROOM.length);
        return { room, label: `#${name}`, href: `?room=${name}`, lat, lon };
      });
  }

  // ponytail: each pick reads every followed room's lines, 100 rooms of 200 at most, on a line and once a second, never on a frame; the Earth
  // holds a few side rooms, and only the lines young enough for a bubble are parsed for mentions.
  #pick(): void {
    const { store, ground, rules } = this.#deps;
    const { me } = store.getState().chat;
    const now = Date.now();
    const how = { joined: me !== undefined, since: now - rules.maxAgeSeconds * 1000 };
    const read = this.#rooms().map((room) => ({ room, messages: bubbleLines([room], how) }));
    const facing = ground.facing();
    const viewer = { account: me ?? "", muted: [], banned: [], ...(facing === undefined ? {} : { facing }) };
    const messages = read.flatMap((each) => each.messages);
    const { bubbles, counts, shown } = pickBubbles(messages, now, viewer, rules, this.#shown);
    this.#shown = shown;
    this.#face(bubbles);
    const whole = read.filter((each) => reaches(each.room, now)).flatMap((each) => each.messages);
    this.#publish({ bubbles, counts, trends: countryTrends(whole, now), pins: this.#pins() });
  }

  // The globe turns to a line of yours once, as it comes (ADR-0002 §1).
  #face(bubbles: readonly Bubble[]): void {
    const mine = bubbles.filter(({ own: yours }) => yours);
    for (const { id, country } of mine) {
      const place = this.#faced.has(id) ? undefined : turnTo(country);
      if (place !== undefined) this.#deps.ground.face(place);
    }
    this.#faced = new Set(mine.map(({ id }) => id));
  }

  #publish(next: Snapshot): void {
    const said = JSON.stringify(next);
    if (said === this.#said) return;
    this.#said = said;
    this.#state.setState(next, true);
  }
}
