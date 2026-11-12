// The stored translations' flow: a line that passed moderation in a room anyone but a members room reads is translated, once, into each
// language signed-in readers use on its world (4 at most), stored and told; a reader's ask makes the missing ones for a signed-in reader
// alone. The text is the server's own, never the page's. A line taken or edited loses its rows, and a making that ends after is not stored.
import type { DatabaseSync } from "node:sqlite";
import type { JarvisTranslate, JarvisTranslation, LineTranslations, TranslationEvent } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import type { Said } from "../irc/link.ts";
import { worldOf } from "../rooms/rooms.ts";
import { searchable, type Typed } from "../rooms/types.ts";
import { makeMaker, type Line, type Outcome } from "./making.ts";
import { MAX_ROWS, TranslationStore, type Language } from "./store.ts";

/** jarvis's translate call, as the door's client makes it. */
export type Translate = (
  request: JarvisTranslate,
  signal: AbortSignal,
) => Promise<{ ok: true; answer: JarvisTranslation } | { ok: false; error?: string }>;

export interface TranslationFlowOptions {
  db: DatabaseSync;
  roles: Typed;
  /** None while Jarvis is off: nothing is made. */
  translate: Translate | undefined;
  /** The languages in use on a world, the most recent first. */
  languages: (world: string) => readonly Language[];
  publish: (event: TranslationEvent) => void;
  log: Log;
  now: () => number;
  /** How long a reader's ask waits for the lines it started. */
  waitMs?: number;
  maxRows?: number;
}

interface Ask {
  room: string;
  ids: readonly string[];
  language: Language;
  signedIn: boolean;
}

export interface TranslationFlow {
  /** A line moderation let through, an edit of one included. */
  heard: (said: Said) => void;
  /** A line taken (REDACT): its translations go. */
  redacted: (room: string, msgid: string) => void;
  /** The stored translations of lines in a language. */
  stored: (room: string, ids: readonly string[], language: Language) => LineTranslations["translations"];
  /** A reader's ask: the stored ones, and those started for a signed-in reader, waited for up to `waitMs`. */
  asked: (request: Ask) => Promise<LineTranslations>;
  /** Retention: at most `limit` rows past 30 days or the cap; how many went. */
  expire: (limit: number) => number;
  idle: () => Promise<void>;
  stop: () => void;
}

const LANGUAGES_A_LINE = 4;

// A line worth translating: some text that is not a link and nothing else.
const wanted = (text: string): boolean => text.trim() !== "" && !/^(?:https?:\/\/\S+\s*)+$/i.test(text.trim());

const stopped = (outcomes: Iterable<Outcome>): "spent" | "off" | undefined =>
  [...outcomes].find((outcome): outcome is "spent" | "off" => outcome === "spent" || outcome === "off");

export function makeTranslationFlow(options: TranslationFlowOptions): TranslationFlow {
  const { db, roles, translate, languages, now, waitMs = 20_000, maxRows = MAX_ROWS } = options;
  const store = new TranslationStore(db, now);
  const maker = makeMaker({ store, ...options });
  const makeAll = (line: Line, text: string): void => {
    if (!wanted(text)) return;
    for (const language of languages(worldOf(line.room)).slice(0, LANGUAGES_A_LINE)) maker.fire(line, text, language);
  };

  // The lines of a signed-in reader's ask that are missing and worth making, started.
  const started = (asked: Ask, have: ReadonlySet<string>) => {
    const { room, ids, language, signedIn } = asked;
    if (!signedIn || !searchable(roles, room) || translate === undefined) return [];
    return ids.flatMap((msgid) => {
      const text = have.has(msgid) ? undefined : store.source(room, msgid)?.text;
      return text !== undefined && wanted(text) ? [{ msgid, made: maker.make({ room, msgid }, text, language) }] : [];
    });
  };

  return {
    heard(said) {
      if (translate === undefined || said.few !== undefined || !searchable(roles, said.room)) return;
      if (said.edits === undefined) {
        makeAll({ room: said.room, msgid: said.msgid }, said.text);
        return;
      }
      // An edit counts from the line's own author alone; its translations are made again under the line's id.
      if (store.source(said.room, said.edits)?.account !== said.account) return;
      const line = { room: said.room, msgid: said.edits };
      maker.drop(line);
      makeAll(line, said.text);
    },
    redacted: (room, msgid) => {
      maker.drop({ room, msgid });
    },
    stored: (room, ids, language) => store.many(room, ids, language),
    async asked(request) {
      const { room, language, signedIn } = request;
      const ids = [...new Set(request.ids)];
      const have = new Set(store.many(room, ids, language).map(({ msgid }) => msgid));
      const jobs = started({ ...request, ids }, have);
      const outcomes = new Map<string, Outcome>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const patience = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      });
      await Promise.race([Promise.all(jobs.map(async ({ msgid, made }) => outcomes.set(msgid, await made))), patience]);
      clearTimeout(timer);
      const off = translate === undefined && signedIn && searchable(roles, room) && have.size < ids.length;
      const halt = off ? "off" : stopped(outcomes.values());
      return {
        room,
        language,
        translations: store.many(room, ids, language),
        pending: jobs.filter(({ msgid }) => !outcomes.has(msgid)).map(({ msgid }) => msgid),
        ...(halt === undefined ? {} : { halt }),
      };
    },
    expire: (limit) => store.expire({ now: now(), maxRows }, limit),
    idle: () => maker.idle(),
    stop: () => {
      maker.stop();
    },
  };
}
