// Making a translation: one call to jarvis a line and language at a time whoever asks, 4 at once, a queue of 200 (the oldest dropped), 60 a
// minute in all, the answer stored and told unless the line was dropped meanwhile.
import type { JarvisTranslation, TranslationEvent } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { limiter } from "../limit.ts";
import { remember } from "../remember.ts";
import type { Translate } from "./flow.ts";
import { type Language, type TranslationStore } from "./store.ts";

export type Outcome = "stored" | "spent" | "off" | "failed" | "limit" | "gone";
export interface Line {
  room: string;
  msgid: string;
}

const AT_ONCE = 4;
const QUEUE = 200;
const CALL_MS = 30_000;
const DROPS = 5000;

function makeSlots() {
  const waiting: ((granted: boolean) => void)[] = [];
  let running = 0;
  return {
    acquire: (): Promise<boolean> =>
      new Promise((resolve) => {
        if (running < AT_ONCE) {
          running += 1;
          resolve(true);
          return;
        }
        waiting.push(resolve);
        // The oldest waiting is dropped, never made.
        if (waiting.length > QUEUE) waiting.shift()?.(false);
      }),
    release: (): void => {
      const next = waiting.shift();
      if (next === undefined) running -= 1;
      else next(true);
    },
    clear: (): void => {
      for (const resolve of waiting.splice(0)) resolve(false);
    },
  };
}

export interface MakerOptions {
  store: TranslationStore;
  translate: Translate | undefined;
  publish: (event: TranslationEvent) => void;
  log: Log;
  now: () => number;
}

export function makeMaker({ store, translate, publish, log, now }: MakerOptions) {
  const slots = makeSlots();
  const breaker = limiter({ max: 60, windowMs: 60_000, keys: 1 });
  const stopping = new AbortController();
  // How many times a line was dropped: a making that began before a drop is not stored.
  const drops = new Map<string, number>();
  const inflight = new Map<string, Promise<Outcome>>();
  const dropsOf = ({ room, msgid }: Line): number => drops.get(`${room} ${msgid}`) ?? 0;

  const settled = (line: Line, language: Language, answer: JarvisTranslation): Outcome => {
    if (answer.status === "spent" || answer.status === "off") return answer.status;
    const key = { ...line, language };
    if (answer.status === "original") {
      if (store.set(key, { status: "original" })) publish({ ...key, status: "original" });
    } else if (store.set(key, answer)) {
      publish({
        ...key,
        status: "translated",
        text: answer.text,
        ...(answer.from === undefined ? {} : { from: answer.from }),
      });
    }
    return "stored";
  };

  const call = async (text: string, language: Language): Promise<Awaited<ReturnType<Translate>>> => {
    try {
      return (
        (await translate?.({ text, language }, AbortSignal.any([stopping.signal, AbortSignal.timeout(CALL_MS)]))) ?? {
          ok: false,
        }
      );
    } catch {
      return { ok: false, error: "thrown" };
    } finally {
      slots.release();
    }
  };

  const run = async (line: Line, text: string, language: Language): Promise<Outcome> => {
    if (translate === undefined || stopping.signal.aborted) return "off";
    if (store.many(line.room, [line.msgid], language).length > 0) return "stored";
    const before = dropsOf(line);
    if (!breaker.take("all", now())) return "limit";
    if (!(await slots.acquire())) return "limit";
    const called = await call(text, language);
    if (dropsOf(line) !== before) return "gone";
    if (!called.ok) {
      log("translation_failed", { room: line.room, error: called.error ?? "failed" });
      return "failed";
    }
    return settled(line, language, called.answer);
  };

  // One making a line and language at a time, whoever asks.
  const make = (line: Line, text: string, language: Language): Promise<Outcome> => {
    const key = `${line.room} ${line.msgid} ${language}`;
    const found = inflight.get(key);
    if (found !== undefined) return found;
    const started = run(line, text, language).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, started);
    return started;
  };
  const ignored = (): undefined => undefined;

  return {
    make,
    /** A making nobody waits for: it never rejects. */
    fire(line: Line, text: string, language: Language): void {
      make(line, text, language).then(ignored, ignored);
    },
    /** A line taken or edited: its rows go, and a making begun before is not stored. */
    drop(line: Line): void {
      remember(drops, [`${line.room} ${line.msgid}`, dropsOf(line) + 1], DROPS);
      store.drop(line.room, line.msgid);
    },
    async idle(): Promise<void> {
      while (inflight.size > 0) await Promise.allSettled([...inflight.values()]);
    },
    stop(): void {
      stopping.abort();
      slots.clear();
    },
  };
}
