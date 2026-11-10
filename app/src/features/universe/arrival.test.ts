// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { enterPage, leavePage, newPage, pageNow } from "./arrival.ts";

vi.mock("../../space/motion.ts", () => ({ motionOf: () => ({ matches: false }) }));

const PLATE = `<div data-exit><div data-look="plate"><div data-content><div><div><div><p data-planet>kicker</p><h1>Title</h1><div data-blocks></div></div></div></div></div></div></div>`;
const SEAT = `<aside data-exit><div data-chat-seat><header id="head">room</header><ol aria-label="Messages"><li id="line">a</li></ol></div></aside>`;
const style = (selector: string): string => {
  const part = document.querySelector<HTMLElement>(selector);
  return `${part?.style.visibility ?? ""}|${part?.style.opacity ?? ""}|${part?.style.transform ?? ""}`;
};
// The page's HTML parsed apart and put in the body: nothing set as HTML.
const show = (html: string): void => {
  document.body.replaceChildren(...new DOMParser().parseFromString(html, "text/html").body.childNodes);
};
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

afterEach(() => {
  document.body.replaceChildren();
});

test("a page's arrival is not killed by the leaving of the page before it (no flight, a phone)", async () => {
  show(`<main>${PLATE}</main>`);
  newPage("world:a");
  const left = pageNow();
  newPage("world:b");
  enterPage(false, false);
  const layer = document.createElement("div");
  document.body.append(layer);
  leavePage(layer, left);
  await wait(2200);
  expect(style("h1")).toBe("||");
  expect(style("[data-planet]")).toBe("||");
});

test("leaving mid-words ends the chat seat's parts at their rest, not half drawn", async () => {
  show(`<main>${PLATE}${SEAT}</main>`);
  newPage("world:c");
  enterPage(false, false);
  await wait(450);
  const layer = document.createElement("div");
  document.body.append(layer);
  leavePage(layer, pageNow());
  await wait(1500);
  expect(style("#head")).toBe("||");
  expect(style("#line")).toBe("||");
});
