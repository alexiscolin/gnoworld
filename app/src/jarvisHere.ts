// What the page's parts share of Jarvis (10u-a), between parts that import nothing of each other (as pageAsks.ts): the chat in view tells
// the room Jarvis could read now, once Jarvis is on; Jarvis's cards, the asker's alone (D1017), are kept here for the chat to draw among
// its lines, and the panel's host (features/jarvis) registers how they are drawn. Memory only: a reload takes them.
import type { JarvisAnswer, JarvisQuestion, JarvisState } from "@gnoworld/schemas";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { Result } from "./lib/api/http.ts";
import type { Language } from "./lib/language.ts";
import { Heard } from "./lib/heard.ts";
import { queryClient } from "./lib/query/client.ts";
import { jarvisStateOptions } from "./lib/query/jarvisState.ts";
import { askFor } from "./pageAsks.ts";

/** Where Jarvis was asked from: the room it reads, and what the cards need of its place. */
export interface JarvisHere {
  room: string;
  /** The place's realm, when it has one. */
  realm?: string | undefined;
  universe: { id: string; isDefault: boolean; gnoweb?: string | undefined };
  /** The account logged in; none for a guest. */
  account?: string | undefined;
  /** The language the reader's lines are translated into, and whether they are, as they come on screen (the device's settings). */
  language?: Language | undefined;
  auto?: boolean | undefined;
}

/** A card of Jarvis in a room's list: its introduction, or an ask and what came back (none yet while it is asked). */
export interface JarvisItem {
  id: string;
  room: string;
  /** Whose it is: a card is shown to the account that asked and to no other (a logout and a login in one tab). */
  account: string | undefined;
  /** When it was asked, as a line's time is written, so it stands among the lines. */
  at: string;
  ask?: JarvisQuestion;
  result?: Result<JarvisAnswer>;
}

let here: JarvisHere | undefined;
let items: readonly JarvisItem[] = [];
let drawing: ((item: JarvisItem) => ReactNode) | undefined;
const heard = new Heard();
const changed = heard.tell;

/** Told by the chat in view; none when Jarvis cannot be asked from it. */
export function tellJarvisHere(next: JarvisHere | undefined): void {
  if (next === here) return;
  here = next;
  changed();
}

/** Where Jarvis can be asked from now, as the chat last told. */
export const useJarvisHere = (): JarvisHere | undefined =>
  useSyncExternalStore(
    heard.subscribe,
    () => here,
    () => undefined,
  );

/** Whether Jarvis is on: off until the server says on, and off for any failure, which the next ask reads again. */
export function useJarvisOn(read?: () => Promise<Result<JarvisState>>): boolean {
  return useQuery(jarvisStateOptions(read), queryClient).data === true;
}

const questions: string[] = [];

/** Asks Jarvis a question of the asker's own words, in the room the chat told; the host, once it has come, takes it. */
export function askJarvis(question: string): void {
  questions.push(question);
  askFor("jarvis-ask");
}

/** The questions asked and not yet taken, the oldest first; taking them empties the list. */
export const takeJarvisQuestions = (): string[] => questions.splice(0);

let made = 0;

/** Adds a card at this moment, with an id of its own, and gives the id. */
export function addJarvisItem(item: Omit<JarvisItem, "id" | "at">): string {
  made += 1;
  const id = `card-${String(made)}`;
  items = [...items, { ...item, id, at: new Date().toISOString() }];
  changed();
  return id;
}

/** Gives the card `id` what came back; the card of another ask is never touched. */
export function settleJarvisItem(id: string, result: Result<JarvisAnswer>): void {
  items = items.map((item) => (item.id === id && item.result === undefined ? { ...item, result } : item));
  changed();
}

/** Every card kept, for the host to ask the state of: one ask in flight an account in a room. */
export const jarvisItems = (): readonly JarvisItem[] => items;

/** The cards of `account` in `room`, oldest first. */
export function useJarvisItems(room: string | undefined, account: string | undefined): readonly JarvisItem[] {
  const all = useSyncExternalStore(
    heard.subscribe,
    () => items,
    () => items,
  );
  return all.filter((item) => item.room === room && item.account === account);
}

/** Registered by the panel's host: how a card is drawn. */
export function setJarvisDrawing(next: ((item: JarvisItem) => ReactNode) | undefined): void {
  drawing = next;
  changed();
}

let saying: ((room: string, msgid: string, fallback: ReactNode) => ReactNode) | undefined;

/** Registered by the panel's host: how a line Jarvis said is drawn, the plain line standing where it cannot be. */
export function setJarvisSaidDrawing(next: typeof saying): void {
  saying = next;
  changed();
}

/** How a line Jarvis said is drawn, once the host's code has come; none before. */
export const useJarvisSaidDrawing = (): typeof saying =>
  useSyncExternalStore(
    heard.subscribe,
    () => saying,
    () => undefined,
  );

/** How a card is drawn, once the host's code has come; none before. */
export const useJarvisDrawing = (): ((item: JarvisItem) => ReactNode) | undefined =>
  useSyncExternalStore(
    heard.subscribe,
    () => drawing,
    () => undefined,
  );
