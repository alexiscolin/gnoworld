// A room's lines translated into the reader's language as they come on screen: the translations the server stored are asked in batches of at
// most TRANSLATIONS_ASKED lines, newest first, one batch after another, never one by one; the stream's events fill the same store. The lines'
// views read it by line; the room reads why the asking stopped.
import { TRANSLATIONS_ASKED, type LineTranslations, type TranslationEvent } from "@gnoworld/schemas";
import { useSyncExternalStore } from "react";
import { pageTranslationsApi } from "./lib/api/translations.ts";
import type { Result } from "./lib/api/http.ts";
import { Heard } from "./lib/heard.ts";
import type { Language } from "./lib/language.ts";

/** The lines that come on screen together are gathered this long before the first ask, so the newest of them goes first. */
export const GATHER_MS = 100;
/** A refusal for the rate is tried again after this. */
export const RETRY_MS = 30_000;
/** A line the server left for later, or still being made, is asked this many times at most. */
const TRIES = 3;

/** What the page holds of a line in a language: asked or being made, translated (folded away or not), already in that language, or failed. */
export type Translation =
  | { state: "asking" }
  | { state: "done"; text: string; from?: Language | undefined; hidden: boolean }
  | { state: "same" }
  | { state: "failed" };

type Ask = (room: string, ids: readonly string[], language: Language) => Promise<Result<LineTranslations>>;
interface Want {
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
const entries = new Map<string, Translation>();
const tries = new Map<string, number>();
let halted: "spent" | "off" | undefined;
// Newest first.
let queue: Want[] = [];
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let api: ReturnType<typeof pageTranslationsApi> | undefined;

function put(key: string, value: Translation | undefined): void {
  if (value === undefined) entries.delete(key);
  else entries.set(key, value);
}

const pageAsk: Ask = (room, ids, language) => (api ??= pageTranslationsApi()).lines(room, ids, language);

function wait(ms: number): void {
  timer = setTimeout(() => {
    timer = undefined;
    pump();
  }, ms);
}

// What a stored answer makes of a line: translated, or already in the reader's language.
const heldOf = (one: LineTranslations["translations"][number]): Translation =>
  one.status === "translated" ? { state: "done", text: one.text, from: one.from, hidden: false } : { state: "same" };

// What a batch's answer says of a line: stored, or left out (failed; none while the asking is halted).
function outcomeOf(id: string, answer: LineTranslations | undefined): Translation | undefined {
  const one = answer?.translations.find((each) => each.msgid === id);
  if (one !== undefined) return heldOf(one);
  return halted === undefined ? { state: "failed" } : undefined;
}

// Lines the answer left for later or still being made, asked again after RETRY_MS unless the stream told them meanwhile.
function again(wants: readonly Want[]): void {
  setTimeout(() => {
    const still = wants.filter(({ of }) => entries.get(keyOf(of))?.state === "asking");
    if (halted !== undefined || still.length === 0) return;
    queue.unshift(...still);
    if (timer === undefined && !busy) wait(GATHER_MS);
  }, RETRY_MS);
}

const leftOf = (id: string, answer: LineTranslations | undefined): boolean =>
  answer !== undefined &&
  !answer.translations.some(({ msgid }) => msgid === id) &&
  [...answer.pending, ...(answer.later ?? [])].includes(id);

// Puts a line's outcome in the store; whether it is to be asked again (left for later or still being made, a bounded number of times).
function settleLine(each: Want, answer: LineTranslations | undefined): boolean {
  const { of } = each;
  const key = keyOf(of);
  const left = leftOf(of.id, answer);
  const asked = (tries.get(key) ?? 0) + 1;
  if (left && asked < TRIES) {
    tries.set(key, asked);
    put(key, { state: "asking" });
    return true;
  }
  tries.delete(key);
  put(key, left ? { state: "failed" } : outcomeOf(of.id, answer));
  return false;
}

function settle(batch: readonly Want[], result: Result<LineTranslations>): number {
  if (!result.ok && result.reason === "too_many") {
    queue.unshift(...batch);
    for (const { of } of batch) put(keyOf(of), undefined);
    return RETRY_MS;
  }
  const answer = result.ok ? result.value : undefined;
  if (answer?.halt !== undefined) {
    halted = answer.halt;
    queue = [];
  }
  const waiting = batch.filter((each) => settleLine(each, answer));
  if (waiting.length > 0) again(waiting);
  return 0;
}

function pump(): void {
  const first = queue[0];
  if (busy || timer !== undefined || halted !== undefined || first === undefined) return;
  const { room, language } = first.of;
  const same = (want: Want) => want.of.room === room && want.of.language === language;
  const batch = queue.filter(same).slice(0, TRANSLATIONS_ASKED);
  queue = queue.filter((want) => !batch.includes(want));
  busy = true;
  for (const { of } of batch) put(keyOf(of), { state: "asking" });
  heard.tell();
  first
    .ask(
      room,
      batch.map(({ of }) => of.id),
      language,
    )
    .then((result) => settle(batch, result))
    .then((after) => {
      busy = false;
      heard.tell();
      if (queue.length > 0) wait(after);
    })
    .catch((error: unknown) => {
      reportError(error);
    });
}

/** Asks for a line that came on screen, unless it is held, asked or queued; the newest comes first. Gives what drops it from the queue as it leaves. */
export function wantTranslation(of: Of, ask: Ask = pageAsk): () => void {
  const key = keyOf(of);
  const want = { of, ask };
  if (halted === undefined && !entries.has(key) && !queue.some((other) => keyOf(other.of) === key)) {
    queue.unshift(want);
    // After the lines that came with it, so the newest of them goes first.
    if (timer === undefined && !busy) wait(GATHER_MS);
  }
  return () => {
    queue = queue.filter((other) => other !== want);
  };
}

/** What the stream told: each line's translation or original, held as if asked. */
export function translationsTold(events: readonly TranslationEvent[]): void {
  for (const event of events) {
    const key = keyOf({ room: event.room, id: event.msgid, language: event.language });
    tries.delete(key);
    if (event.status === "gone") put(key, undefined);
    else
      put(
        key,
        event.status === "original"
          ? { state: "same" }
          : { state: "done", text: event.text, from: event.from, hidden: false },
      );
  }
  heard.tell();
}

/** What the page holds of a line in a language, none while it has not asked. */
export const translationNow = (of: Of): Translation | undefined => entries.get(keyOf(of));

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
  const now = entries.get(key);
  if (now?.state === "done") put(key, { ...now, hidden });
  heard.tell();
}

/** Why the asking stopped: the day's budget is spent, or Jarvis is off; none while it goes on. */
export const translationHalt = (): "spent" | "off" | undefined => halted;

/** The reason the asking stopped, as it changes. */
export const useTranslationHalt = (): "spent" | "off" | undefined =>
  useSyncExternalStore(heard.subscribe, translationHalt, () => undefined);
