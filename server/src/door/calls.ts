// The door's calls to jarvis for an ask (D13985): the answers kept, the one call in flight for the same ask, the room's cap
// and the effects of an answer on the account's quota and share. Asks with the same key at once share one call, never
// stopped for a reader leaving; a quota full for the asker that made it sends the others back through. The effects run
// before the call leaves the table, so a later ask finds the answer kept or none in flight.
import type { Address, JarvisAnswer, JarvisAsk, JarvisPaidAnswer, JarvisQuestion } from "@gnoworld/schemas";
import type { Day } from "./day.ts";
import type { Jarvis, Failure } from "./jarvis.ts";
import type { Counted } from "./quota.ts";
import { makeRoomCap } from "./roomcap.ts";
import type { Served } from "./served.ts";

export type Called = { ok: true; answer: JarvisPaidAnswer } | { ok: false; error: Failure };
type Outcome = { full: true } | { full: false; called: Called };
/** What a call comes to for its asker: served, told the room is full, the quota full, or jarvis's word. */
export type Result =
  { kind: "served"; answer: JarvisAnswer } | { kind: "busy" } | { kind: "full" } | { kind: "called"; called: Called };

/** One ask of one account, as the door makes it. */
export interface Asked {
  key: string;
  who: Address;
  room: string;
  started: number;
  // Whether the chat has heard the room: only such a room has a cap.
  heard: boolean;
  // The ask, without the room's lines, which are read when its call is made.
  ask: JarvisQuestion;
}

interface Deps {
  quota: Counted<"take" | "giveBack">["quota"];
  named: Counted<"take">["named"];
  recent: (room: string, asker: string) => JarvisAsk["lines"];
  jarvis: Pick<Jarvis, "ask">;
  day: Pick<Day, "spend">;
  served: Pick<Served, "get" | "set">;
}

/** What the page reads of an answer: never its cost; a `failed` is no answer but a failure, so none. */
function forPage(answer: JarvisPaidAnswer): JarvisAnswer | undefined {
  if (answer.status === "failed") return undefined;
  if (answer.status === "answered") return { status: "answered", markdown: answer.markdown, buttons: answer.buttons };
  return { status: answer.status };
}

/** A call as the door's relay answers it: what the page reads, or the failure. */
export type Relayed = { ok: true; answer: JarvisAnswer } | { ok: false; error: Failure };
export function forRelay(called: Called): Relayed {
  if (!called.ok) return called;
  const page = forPage(called.answer);
  return page === undefined ? { ok: false, error: "failed" } : { ok: true, answer: page };
}

// What a call that may have spent and told nothing is charged to the share: 0.05 $, in millionths.
const UNKNOWN_COST = 50_000;
const costOf = (called: Called): number => {
  if (!called.ok) return ["slow", "failed", "shape", "lost"].includes(called.error) ? UNKNOWN_COST : 0;
  return "cost" in called.answer ? (called.answer.cost ?? 0) : 0;
};
// Whether jarvis made nothing and spent nothing for a call: its question is given back.
const nothing = (called: Called): boolean =>
  called.ok
    ? (called.answer.status === "spent" || called.answer.status === "off") && costOf(called) === 0
    : called.error === "refused";

export function callsOf({ quota, named, recent, jarvis, day, served }: Deps) {
  const cap = makeRoomCap();
  const flights = new Map<string, Promise<Outcome>>();
  // What an answer does to the account's quota, the room's slot, its share, and the answers kept. A call is never stopped
  // when its asker leaves: it ends, and its cost is the share of the one who asked first.
  const settle = ({ who, room, started, key }: Asked, called: Called): void => {
    if (nothing(called)) quota.giveBack(who, started);
    if (nothing(called) || (!called.ok && called.error === "down")) cap.give(room, started);
    const cost = costOf(called);
    day.spend(who, cost, started);
    const page = called.ok ? forPage(called.answer) : undefined;
    if (page !== undefined) served.set(key, page, { room, started });
  };
  const call = async (asked: Asked): Promise<Outcome> => {
    const { who, room, started, ask } = asked;
    try {
      const lines = recent(room, "ask" in ask ? "" : who);
      if (!quota.take(who, await named(who), started)) {
        cap.give(room, started);
        return { full: true };
      }
      const called = await jarvis.ask({ ...ask, lines }, new AbortController().signal);
      settle(asked, called);
      return { full: false, called };
    } finally {
      flights.delete(asked.key);
    }
  };
  // The call of an ask nobody is making: in the table before it starts any work, so a throw never leaves it a rejection.
  const make = async (asked: Asked): Promise<Result> => {
    const outcome = Promise.resolve().then(() => call(asked));
    flights.set(asked.key, outcome);
    const done = await outcome;
    return done.full ? { kind: "full" } : { kind: "called", called: done.called };
  };
  // Another's call waited for: served from what it made, or its word as it is; none for a quota full, which is its asker's.
  const wait = async (flight: Promise<Outcome>): Promise<Result | undefined> => {
    const outcome = await flight;
    if (outcome.full) return undefined;
    const { called } = outcome;
    const page = called.ok ? forPage(called.answer) : undefined;
    if (page?.status === "answered" || page?.status === "declined") return { kind: "served", answer: page };
    return { kind: "called", called };
  };
  return async (asked: Asked): Promise<Result> => {
    for (;;) {
      const kept = served.get(asked.key);
      if (kept !== undefined) return { kind: "served", answer: kept };
      const flight = flights.get(asked.key);
      if (flight === undefined) break;
      const result = await wait(flight);
      if (result !== undefined) return result;
    }
    // A room the chat never heard has no line to answer from: its cap is the account's limits.
    if (asked.heard && !cap.take(asked.room, asked.started)) return { kind: "busy" };
    return make(asked);
  };
}
