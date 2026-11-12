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
const ignored = (): undefined => undefined;

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

const translated = (key: Line & { language: Language }, answer: { text: string; from?: Language | undefined }) =>
  ({
    ...key,
    status: "translated",
    text: answer.text,
    ...(answer.from === undefined ? {} : { from: answer.from }),
  }) as const;

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
  const drops = new Map<string, number>();
  const inflight = new Map<string, Promise<Outcome>>();
  const running = new Set<Promise<Outcome>>();
  const dropsOf = ({ room, msgid }: Line): number => drops.get(`${room} ${msgid}`) ?? 0;

  const settled = (line: Line, language: Language, answer: JarvisTranslation): Outcome => {
    if (answer.status === "spent" || answer.status === "off") return answer.status;
    const key = { ...line, language };
    if (answer.status === "original") {
      if (store.set(key, { status: "original" })) publish({ ...key, status: "original" });
    } else if (store.set(key, answer)) {
      publish(translated(key, answer));
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

  const make = (line: Line, text: string, language: Language): Promise<Outcome> => {
    const key = `${line.room} ${line.msgid} ${language}`;
    const found = inflight.get(key);
    if (found !== undefined) return found;
    const started: Promise<Outcome> = run(line, text, language).finally(() => {
      if (inflight.get(key) === started) inflight.delete(key);
      running.delete(started);
    });
    inflight.set(key, started);
    running.add(started);
    return started;
  };

  return {
    make,
    /** A making nobody waits for: it never rejects. */
    fire(line: Line, text: string, language: Language): void {
      make(line, text, language).then(ignored, ignored);
    },
    /** A line taken or edited: its rows go and are told gone, its makings under way are let go (a new ask makes anew), and one begun before is not stored. */
    drop(line: Line): void {
      remember(drops, [`${line.room} ${line.msgid}`, dropsOf(line) + 1], DROPS);
      for (const key of inflight.keys()) if (key.startsWith(`${line.room} ${line.msgid} `)) inflight.delete(key);
      for (const language of store.drop(line.room, line.msgid)) publish({ ...line, language, status: "gone" });
    },
    async idle(): Promise<void> {
      while (running.size > 0) await Promise.allSettled([...running]);
    },
    stop(): void {
      stopping.abort();
      slots.clear();
    },
  };
}
