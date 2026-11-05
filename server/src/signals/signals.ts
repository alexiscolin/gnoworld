// The first signals (slice 9h, D210 to D219): the first logged-in account to open a world, and the first line of a world
// that passed moderation, each recorded once a world by a unique key in SQLite. The store is the truth: the routes and the
// stream only tell it. An account is an address and nothing else; a guest's nick or any other text is never recorded.
import type { DatabaseSync } from "node:sqlite";
import { Address, ChartRequest, type Signal, type WorldFirsts } from "@gnoworld/schemas";
import { z } from "zod";
import type { RecentLines } from "../door/lines.ts";
import type { Said } from "../irc/link.ts";
import { worldOf } from "../rooms/rooms.ts";
import { openRoom, type Typed } from "../rooms/types.ts";
import type { Stream } from "../stream/stream.ts";

export const SIGNAL_TABLES = `
CREATE TABLE first_signals (
  world TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('chart', 'words')),
  account TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (world, kind)
) STRICT;
`;

export interface Signals {
  /** Records the account as the world's first to chart; whether this call was it. A guest, or what is no address, never is. */
  chart: (world: string, account: string) => boolean;
  /** Records the account as the world's first words; whether this call was it. */
  words: (world: string, account: string) => boolean;
  /** Who is first in a world, each or none. */
  firsts: (world: string) => WorldFirsts;
}

export function makeSignals(db: DatabaseSync, { now }: { now: () => number }): Signals {
  // Read at each call, not at import: StrykerJS mutates only what runs inside a test.
  const Row = z.object({ kind: z.enum(["chart", "words"]), account: Address, at: z.number() });
  const insert = db.prepare("INSERT OR IGNORE INTO first_signals (world, kind, account, at) VALUES (?, ?, ?, ?)");
  const read = db.prepare("SELECT kind, account, at FROM first_signals WHERE world = ?");
  // The unique key decides, not this process: a second writer's insert changes no row.
  const record =
    (kind: Signal["kind"]) =>
    (world: string, account: string): boolean =>
      ChartRequest.safeParse({ world }).success &&
      Address.safeParse(account).success &&
      insert.run(world, kind, account, now()).changes === 1;
  return {
    chart: record("chart"),
    words: record("words"),
    firsts: (world) => {
      const firsts: WorldFirsts = { world, charted: null, words: null };
      for (const row of read.all(world)) {
        const { kind, account, at } = Row.parse(row);
        const first = { account, at: new Date(at).toISOString() };
        if (kind === "chart") firsts.charted = first;
        else firsts.words = first;
      }
      return firsts;
    },
  };
}

/** Every first the store holds for these worlds, as the signals a new process's stream tells again: the plate hears who is
 * first on the stream alone. */
export const firstSignals = (signals: Signals, worlds: Iterable<string>): Signal[] =>
  [...worlds].flatMap((world) => {
    const { charted, words } = signals.firsts(world);
    return [
      ...(charted === null ? [] : [{ kind: "chart" as const, world, ...charted }]),
      ...(words === null ? [] : [{ kind: "words" as const, world, ...words }]),
    ];
  });

interface FirstWordsOptions {
  signals: Signals;
  publish: (signal: Signal) => void;
  // Whether a room's lines may be a world's first words: open to everyone and listed (D214).
  isPublic: (room: string) => boolean;
}

/** The line moderation let through, as the way hands it on (moderation/way.ts): the first of a world, from a person,
 * said to the whole of a public room, is recorded and told once. An edit is no new words, a line to the operators alone
 * (`few`) is not said to the room, and a room that is not public must never put its author's address on a banner. */
export function firstWords({ signals, publish, isPublic }: FirstWordsOptions): (said: Said) => void {
  return ({ room, account, few, edits }) => {
    if (few !== undefined || edits !== undefined || !isPublic(room)) return;
    const world = worldOf(room);
    if (!signals.words(world, account)) return;
    const first = signals.firsts(world).words;
    if (first !== null) publish({ kind: "words", world, account: first.account, at: first.at });
  };
}

interface Passed {
  roles: Typed;
  // The recent lines: every line that passed goes to them, first words or not.
  recent: Pick<RecentLines, "passed">;
  stream: Pick<Stream, "signal">;
  // Without the store, no first words are kept.
  signals: Signals | undefined;
}

/** What a line moderation let through is handed to: the recent lines and, with the signals' store, the first words. */
export function passedLines({ roles, recent, stream, signals }: Passed): (said: Said) => void {
  if (signals === undefined) return recent.passed;
  const words = firstWords({ signals, publish: stream.signal, isPublic: (room) => openRoom(roles, room) });
  return (said) => {
    recent.passed(said);
    words(said);
  };
}
