// A room's lines translated into the reader's language as they come on screen: each line is asked once a language, newest first, one after
// another with no wait, up to ASKS_A_MINUTE in any minute (the door lets 30 a minute and 200 a day), the answer kept on the device. The lines'
// views read it by line; the room reads why the asking stopped. Memory first, the device's keeping loaded on the first use.
import type { JarvisTranslateRequest, JarvisTranslation } from "@gnoworld/schemas";
import { useSyncExternalStore } from "react";
import { pageJarvisApi } from "./lib/api/jarvis.ts";
import type { Result } from "./lib/api/http.ts";
import { Heard } from "./lib/heard.ts";
import { pageTranslations } from "./lib/keep/translations.ts";
import type { Language } from "./lib/language.ts";

/** The asks in any minute: under the door's 30, which counts a minute from an account's first ask. */
export const ASKS_A_MINUTE = 24;
const MINUTE_MS = 60_000;
/** The lines that come on screen together are gathered this long before the first ask, so the newest of them goes first. */
export const GATHER_MS = 100;
/** A refusal for the rate is tried again after this. */
export const RETRY_MS = 30_000;

/** What the page holds of a line in a language: asked and under way, translated (folded away or not), already in that language, or failed. */
export type Translation =
  | { state: "asking" }
  | { state: "done"; text: string; from?: Language | undefined; hidden: boolean }
  | { state: "same" }
  | { state: "failed" };

type Ask = (request: JarvisTranslateRequest) => Promise<Result<JarvisTranslation>>;
interface Job {
  of: Of;
  ask: Ask;
}

/** A line in a language. */
export interface Of {
  room: string;
  id: string;
  language: Language;
}

const keyOf = ({ room, id, language }: Of) => `${room}|${id}|${language}`;
const heard = new Heard();
const device = pageTranslations();
let entries: Map<string, Translation> | undefined;
let halted: "spent" | "off" | undefined;
// Newest first.
let queue: Job[] = [];
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let api: ReturnType<typeof pageJarvisApi> | undefined;
// When the asks of the last minute went, the oldest first.
let asked: number[] = [];

// How long the next ask waits: none while the last minute holds fewer than ASKS_A_MINUTE, else till the oldest of them is a minute old.
function room(): number {
  const now = Date.now();
  asked = asked.filter((at) => now - at < MINUTE_MS);
  const oldest = asked[0];
  return asked.length < ASKS_A_MINUTE || oldest === undefined ? 0 : oldest + MINUTE_MS - now;
}

// The device's keeping, read once.
function held(): Map<string, Translation> {
  entries ??= new Map(
    Object.entries(device.get()).map(([key, kept]): [string, Translation] => [
      key,
      "original" in kept ? { state: "same" } : { state: "done", text: kept.text, from: kept.from, hidden: false },
    ]),
  );
  return entries;
}

function put(key: string, value: Translation | undefined): void {
  if (value === undefined) held().delete(key);
  else held().set(key, value);
  heard.tell();
}

const pageAsk: Ask = (request) => (api ??= pageJarvisApi()).translate(request);

function wait(ms: number): void {
  timer = setTimeout(() => {
    timer = undefined;
    pump();
  }, ms);
}

function settle(key: string, job: Job, result: Result<JarvisTranslation>): number {
  if (!result.ok) {
    if (result.reason === "too_many") {
      queue.unshift(job);
      put(key, undefined);
      return RETRY_MS;
    }
    put(key, { state: "failed" });
  } else if (result.value.status === "translated") {
    const { text, from } = result.value;
    put(key, { state: "done", text, from, hidden: false });
    device.add(key, from === undefined ? { text } : { text, from });
  } else if (result.value.status === "original") {
    put(key, { state: "same" });
    device.add(key, { original: true });
  } else {
    halted = result.value.status;
    queue = [];
    put(key, undefined);
  }
  return room();
}

function pump(): void {
  const job = queue.shift();
  if (busy || timer !== undefined || halted !== undefined || job === undefined) {
    if (job !== undefined) queue.unshift(job);
    return;
  }
  busy = true;
  asked.push(Date.now());
  const key = keyOf(job.of);
  put(key, { state: "asking" });
  job
    .ask({ room: job.of.room, msgid: job.of.id, language: job.of.language })
    .then((result) => settle(key, job, result))
    .then((after) => {
      busy = false;
      wait(after);
    })
    .catch((error: unknown) => {
      reportError(error);
    });
}

/** Asks for a line that came on screen, unless it is held, asked or queued; the newest comes first. Gives what drops it from the queue as it leaves. */
export function wantTranslation(of: Of, ask: Ask = pageAsk): () => void {
  const key = keyOf(of);
  const job = { of, ask };
  const queued = (other: Job) => keyOf(other.of) === key;
  if (halted === undefined && !held().has(key) && !queue.some(queued)) {
    queue.unshift(job);
    // After the lines that came with it, so the newest of them goes first.
    if (timer === undefined && !busy) wait(GATHER_MS);
  }
  return () => {
    queue = queue.filter((other) => other !== job);
  };
}

/** What the page holds of a line in a language, none while it has not asked. */
export const translationNow = (of: Of): Translation | undefined => held().get(keyOf(of));

/** A line's translation as it changes. */
export const useTranslation = (room: string | undefined, id: string, language: Language): Translation | undefined =>
  useSyncExternalStore(
    heard.subscribe,
    () => (room === undefined ? undefined : translationNow({ room, id, language })),
    () => undefined,
  );

/** Folds a line's translation away, or brings it back: the line's own words are never touched. */
export function foldTranslation(of: Of, hidden: boolean): void {
  const key = keyOf(of);
  const now = held().get(key);
  if (now?.state === "done") put(key, { ...now, hidden });
}

/** Why the asking stopped: the day's budget is spent, or Jarvis is off; none while it goes on. */
export const translationHalt = (): "spent" | "off" | undefined => halted;

/** The reason the asking stopped, as it changes. */
export const useTranslationHalt = (): "spent" | "off" | undefined =>
  useSyncExternalStore(heard.subscribe, translationHalt, () => undefined);
