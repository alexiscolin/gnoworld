// A room of a world on the scripted Ergo (scripted.ts) for 4f's journeys, who is typing and the reading place: what the
// page sends, the socket to say a live line on, and the words read from them.
import type { WebSocketRoute } from "@playwright/test";
import { lines } from "./chat.ts";
import { expect, hydrated, type Page } from "./fixtures.ts";
import { MEMBER, scriptedErgo, type HistoryLine, type Scripted } from "./scripted.ts";

const GUEST = "guest-zzzzzz";
export const ROOM = "#bubble/games";
export const OTHER = "g1f6dcp6he2vq9gymrm4yrnyx66n0578vf7fsksl";
export const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
export const HISTORY: readonly HistoryLine[] = [
  ["m1", T(0), "the first line"],
  ["m2", T(1), "the second line"],
  ["m3", T(2), "the third line"],
];

// #games opened on a scripted Ergo, as `me`; every line the page sends, and the latest socket, to say a live line on.
export async function room(page: Page, { me = GUEST, ...options }: Scripted & { me?: string } = {}) {
  const sent: string[] = [];
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    sockets.push(ergo);
    scriptedErgo(ergo, me, { history: HISTORY, heard: (line) => sent.push(line), ...options });
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(lines(page)).toHaveCount(options.history?.length ?? HISTORY.length);
  const ergo = () => {
    const socket = sockets.at(-1);
    if (socket === undefined) throw new Error("the page opened no socket");
    return socket;
  };
  return { sent, ergo, sockets };
}
export const typingOf = (state: string, nick = MEMBER, room = ROOM) =>
  `@+typing=${state};time=${T(30)};account=${nick} :${nick}!u@h TAGMSG ${room}`;
export const live = (id: string, time: string, { room = ROOM, text = id }: { room?: string; text?: string } = {}) =>
  `@msgid=${id};time=${time};account=${MEMBER} :${MEMBER}!u@h PRIVMSG ${room} :${text}`;
export const typist = (page: Page) => page.getByText(/is typing…|are typing…/);
export const tags = (sent: readonly string[]) => sent.filter((line) => line.includes(" TAGMSG "));
export const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });
// The places the page set: a MARKREAD with its time, not its ask of Ergo's place (CR7).
export const marks = (sent: readonly string[]) => sent.filter((line) => /^MARKREAD \S+ timestamp=/.test(line));
// What the page sent before a word of its own written now: that word's TAGMSG goes out behind all of it, on the same
// socket, so what is missing before it was never sent.
export async function sentBefore(page: Page, sent: readonly string[]): Promise<readonly string[]> {
  const told = tags(sent).length;
  await field(page).fill(`barrier ${String(told)}`);
  await expect.poll(() => tags(sent).length).toBeGreaterThan(told);
  return sent.slice(
    0,
    sent.findLastIndex((line) => line.includes(" TAGMSG ")),
  );
}
// A tab hidden from the start, which the test shows or hides again as a browser does when the tab changes.
export const hiddenTab = (page: Page, hidden: boolean) =>
  page.addInitScript((start) => {
    let now = start;
    Object.defineProperty(document, "visibilityState", { get: () => (now ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { get: () => now });
    for (const [name, value] of [
      ["test:show", false],
      ["test:hide", true],
    ] as const) {
      document.addEventListener(name, () => {
        now = value;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    // The page's visibilitychange listeners, counted as they come and go (the green pass's G3).
    const listeners = new Set<unknown>();
    const add = EventTarget.prototype.addEventListener.bind(document);
    const remove = EventTarget.prototype.removeEventListener.bind(document);
    Object.assign(document, {
      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions,
      ) {
        if (type === "visibilitychange") listeners.add(listener);
        add(type, listener, options);
      },
      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: EventListenerOptions,
      ) {
        if (type === "visibilitychange") listeners.delete(listener);
        remove(type, listener, options);
      },
    });
    Object.defineProperty(window, "visibilityListeners", { get: () => listeners.size });
  }, hidden);
/** How many visibilitychange listeners the page holds, under hiddenTab. */
export const visibilityListeners = (page: Page) =>
  page.evaluate(() => Number(Reflect.get(window, "visibilityListeners")));
export const tab = (page: Page, word: "show" | "hide") =>
  page.evaluate((name) => document.dispatchEvent(new Event(name)), `test:${word}`);
