// The stored translations' flow: a line that passed moderation in a room anyone but a members room reads is translated, once, into each
// language signed-in readers use on its world (4 at most), stored and told; a reader's ask makes the missing ones for a signed-in reader
// alone. The text is the server's own, never the page's. A line taken or edited loses its rows, and a making that ends after is not stored.
import type { DatabaseSync } from "node:sqlite";
import {
  TRANSLATIONS_WAIT_MS,
  type JarvisTranslate,
  type JarvisTranslation,
  type LineTranslations,
  type TranslationEvent,
} from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { limiter } from "../limit.ts";
import type { Said } from "../irc/link.ts";
import { remember } from "../remember.ts";
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
  /** The signed-in reader's address: its makings are counted. */
  account?: string | undefined;
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
/** The edits remembered for their line: a REDACT of an edit drops the line's translations. */
const EDITS = 10_000;
/** Makings one account's asks start a minute: its own lines past this wait for the next minute (U2: the day's budget is shared). */
const MAKINGS_PER_MINUTE = 20;

// A line worth translating: some text that is not a link and nothing else.
const wanted = (text: string): boolean => text.trim() !== "" && !/^(?:https?:\/\/\S+\s*)+$/i.test(text.trim());

const stopped = (outcomes: Iterable<Outcome>): "spent" | "off" | undefined =>
  [...outcomes].find((outcome): outcome is "spent" | "off" => outcome === "spent" || outcome === "off");

export function makeTranslationFlow(options: TranslationFlowOptions): TranslationFlow {
  const { db, roles, translate, languages, now, waitMs = TRANSLATIONS_WAIT_MS, maxRows = MAX_ROWS } = options;
  const store = new TranslationStore(db, now);
  const byAccount = limiter({ max: MAKINGS_PER_MINUTE, windowMs: 60_000, keys: 10_000 });
  const maker = makeMaker({ store, ...options });
  const editsOf = new Map<string, string>();
  const makeAll = (line: Line, text: string): void => {
    if (!wanted(text)) return;
    for (const language of languages(worldOf(line.room)).slice(0, LANGUAGES_A_LINE)) maker.fire(line, text, language);
  };

  const textOf = (room: string, msgid: string, have: ReadonlySet<string>): string | undefined => {
    const text = have.has(msgid) ? undefined : store.source(room, msgid)?.text;
    return text !== undefined && wanted(text) ? text : undefined;
  };

  // The lines of a signed-in reader's ask that are missing and worth making, started.
  const started = (asked: Ask, have: ReadonlySet<string>) => {
    const { room, ids, language, signedIn, account = "" } = asked;
    const jobs: { msgid: string; made: Promise<Outcome> }[] = [];
    const later: string[] = [];
    if (!signedIn || !searchable(roles, room) || translate === undefined) return { jobs, later };
    for (const msgid of ids) {
      const text = textOf(room, msgid, have);
      if (text === undefined) continue;
      // Over the account's limit: named, so the page asks again.
      if (byAccount.take(account, now())) jobs.push({ msgid, made: maker.make({ room, msgid }, text, language) });
      else later.push(msgid);
    }
    return { jobs, later };
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
      remember(editsOf, [`${said.room} ${said.msgid}`, said.edits], EDITS);
      maker.drop(line);
      makeAll(line, said.text);
    },
    redacted: (room, msgid) => {
      // The id may be an edit's: the words it carried are the line's translations.
      const line = editsOf.get(`${room} ${msgid}`) ?? store.lineOf(room, msgid) ?? msgid;
      maker.drop({ room, msgid: line });
    },
    stored: (room, ids, language) => store.many(room, ids, language),
    async asked(request) {
      const { room, language, signedIn } = request;
      const ids = [...new Set(request.ids)];
      const have = new Set(store.many(room, ids, language).map(({ msgid }) => msgid));
      const { jobs, later } = started({ ...request, ids }, have);
      const outcomes = new Map<string, Outcome>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const patience = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      });
      await Promise.race([Promise.all(jobs.map(async ({ msgid, made }) => outcomes.set(msgid, await made))), patience]);
      clearTimeout(timer);
      const off = translate === undefined && signedIn && searchable(roles, room) && have.size < ids.length;
      // Left for later: over the account's limit, or refused by the breaker.
      const unmade = [
        ...later,
        ...jobs.filter(({ msgid }) => outcomes.get(msgid) === "limit").map(({ msgid }) => msgid),
      ];
      const halt = off ? "off" : stopped(outcomes.values());
      return {
        room,
        language,
        translations: store.many(room, ids, language),
        pending: jobs.filter(({ msgid }) => !outcomes.has(msgid)).map(({ msgid }) => msgid),
        ...(unmade.length === 0 ? {} : { later: unmade }),
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
