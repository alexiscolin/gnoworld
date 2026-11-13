// A room's lines translated into the reader's language as they come on screen: the translations the server stored are asked in batches of at
// most TRANSLATIONS_ASKED lines, newest first, one batch after another, never one by one; the stream's events fill the same store. The lines'
// views read it by line; the room reads why the asking stopped.
import { TRANSLATIONS_ASKED, type LineTranslations, type TranslationEvent } from "@gnoworld/schemas";
import { useSyncExternalStore } from "react";
import { pageTranslationsApi } from "./lib/api/translations.ts";
import type { Result } from "./lib/api/http.ts";
import { DAY_MS } from "./lib/days.ts";
import { Heard } from "./lib/heard.ts";
import type { Language } from "./lib/language.ts";
import { trimOldest } from "@gnoworld/core";
import { LINES_KEPT } from "./store/chat.ts";

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
// A room's lines in one language, by id, in the order they were first held; a long visit keeps the newest, as the store keeps a room's lines.
const shelves = new Map<string, Map<string, Translation>>();
const shelfOf = ({ room, language }: Of) => `${room}|${language}`;
const tries = new Map<string, number>();
const KEPT = 2 * LINES_KEPT;
let linesOf: Lines | undefined;
let halted: "spent" | "off" | undefined;
// Newest first.
let queue: Want[] = [];
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let api: ReturnType<typeof pageTranslationsApi> | undefined;

/** What the page's store holds of a room's lines, none for a room it does not follow. */
type Lines = (room: string) => readonly { id: string }[] | undefined;

// Past the bound, the lines the store holds no more go first, then the oldest; a line still being asked stays, its tries counted.
function trim(shelf: Map<string, Translation>, room: string): void {
  const inStore = new Set(linesOf?.(room)?.map(({ id }) => id));
  const asking = (id: string) => shelf.get(id)?.state === "asking";
  trimOldest(shelf, KEPT, { may: (id) => !asking(id) && !inStore.has(id) });
  trimOldest(shelf, KEPT, { may: (id) => !asking(id) });
}

function put(of: Of, value: Translation | undefined): void {
  if (value?.state !== "asking") tries.delete(keyOf(of));
  const name = shelfOf(of);
  const shelf = shelves.get(name);
  if (value === undefined) {
    shelf?.delete(of.id);
    if (shelf?.size === 0) shelves.delete(name);
    return;
  }
  const held = shelf ?? new Map<string, Translation>();
  shelves.set(name, held);
  held.set(of.id, value);
  if (held.size > KEPT) trim(held, of.room);
}

/** Tells which lines the page's store holds of a room, so a room's translations drop first those of lines it holds no more; gives
 * what forgets it. */
export function translationLines(lines: Lines): () => void {
  linesOf = lines;
  return () => {
    if (linesOf === lines) linesOf = undefined;
  };
}

// A day's budget spent is spent until the next UTC day; Jarvis off is off for the page.
function resume(): void {
  if (halted !== "spent" || Date.now() < resumesAt) return;
  halted = undefined;
  heard.tell();
}
let resumesAt = 0;

function halt(reason: "spent" | "off"): void {
  halted = reason;
  queue = [];
  if (reason !== "spent") return;
  resumesAt = Date.now() - (Date.now() % DAY_MS) + DAY_MS;
  setTimeout(resume, resumesAt - Date.now());
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
    const still = wants.filter(({ of }) => translationNow(of)?.state === "asking");
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
// A request the network dropped leaves its lines for later too.
function settleLine(each: Want, answer: LineTranslations | undefined, dropped: boolean): boolean {
  const { of } = each;
  const key = keyOf(of);
  const left = dropped || leftOf(of.id, answer);
  const asked = (tries.get(key) ?? 0) + 1;
  if (left && asked < TRIES) {
    tries.set(key, asked);
    put(of, { state: "asking" });
    return true;
  }
  put(of, left ? { state: "failed" } : outcomeOf(of.id, answer));
  return false;
}

function settle(batch: readonly Want[], result: Result<LineTranslations>): number {
  if (!result.ok && result.reason === "too_many") {
    queue.unshift(...batch);
    for (const { of } of batch) put(of, undefined);
    return RETRY_MS;
  }
  const answer = result.ok ? result.value : undefined;
  if (answer?.halt !== undefined) halt(answer.halt);
  const dropped = !result.ok && result.reason === "network";
  const waiting = batch.filter((each) => settleLine(each, answer, dropped));
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
  for (const { of } of batch) put(of, { state: "asking" });
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
  resume();
  if (halted === undefined && translationNow(of) === undefined && !queue.some((other) => keyOf(other.of) === key)) {
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
    const of = { room: event.room, id: event.msgid, language: event.language };
    if (event.status === "gone") put(of, undefined);
    else
      put(
        of,
        event.status === "original"
          ? { state: "same" }
          : { state: "done", text: event.text, from: event.from, hidden: false },
      );
  }
  heard.tell();
}

/** What the page holds of a line in a language, none while it has not asked. */
export const translationNow = (of: Of): Translation | undefined => shelves.get(shelfOf(of))?.get(of.id);

/** A line's translation as it changes. */
export const useTranslation = (room: string | undefined, id: string, language: Language): Translation | undefined =>
  useSyncExternalStore(
    heard.subscribe,
    () => (room === undefined ? undefined : translationNow({ room, id, language })),
    () => undefined,
  );

/** Folds a line's translation away, or brings it back: the line's own words are never touched. */
export function foldTranslation(of: Of, hidden: boolean): void {
  const now = translationNow(of);
  if (now?.state === "done") put(of, { ...now, hidden });
  heard.tell();
}

/** Why the asking stopped: the day's budget is spent, or Jarvis is off; none while it goes on. */
export const translationHalt = (): "spent" | "off" | undefined => halted;

/** The reason the asking stopped, as it changes. */
export const useTranslationHalt = (): "spent" | "off" | undefined =>
  useSyncExternalStore(heard.subscribe, translationHalt, () => undefined);
