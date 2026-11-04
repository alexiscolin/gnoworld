// @vitest-environment jsdom
import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { all, click, modals, mount, one } from "../../../tests/mount.tsx";
import "../../plugs.ts";
import { slot } from "../../slots.tsx";
import { drawing } from "../chat/index.ts";
import { PreviewCard, type PreviewCardProps } from "./PreviewCard.tsx";

// A page's capture as a card (8f): on a world's plate (frame 26: "Preview · gno.land/r/gov/dao · captured · Open large") and under a
// chat line (frames 104, 107). The capture is drawn small as a picture of the page, never a part of it a reader can use; Open large
// shows it at size, with when it was captured and the way to the page as it is now.
const via = await drawing();
// The realm page's drawing as the page gets it, through its slot (plugs.ts).
const Blocks = await (slot("pageDrawing") ?? (() => Promise.reject(new Error("no drawing plugged"))))();
const GNOWEB = "https://onyx.testnets.gno.land";
const CAPTURE = {
  path: "gno.land/r/gov/dao",
  captured: "2026-11-05T10:00:00.000Z",
  text: "# GovDAO\n## Proposals\n### [Prop #37](/r/gov/dao:37)\nStatus: ACCEPTED\n",
};
const HOSTILE = [
  "# Welcome",
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "![a tracker](https://tracker.example/pixel.png)",
  "[click me](javascript:alert(1))",
  "[away](https://evil.example/phish)",
  '<gno-form exec="Drain">',
  '<gno-input name="amount" type="text" />',
  "</gno-form>",
].join("\n");

beforeAll(modals);

const card = (over: Partial<PreviewCardProps> = {}) =>
  mount(
    <PreviewCard
      capture={CAPTURE}
      look="plate"
      gnoweb={GNOWEB}
      via={via}
      Blocks={Blocks}
      live="/r/gov/dao"
      {...over}
    />,
  );
const opener = (box: HTMLElement) => one(box, "button[data-preview]");

describe("PreviewCard", () => {
  it("says what it is in the video's words: Preview, the page's path, captured, Open large", () => {
    const words = opener(card()).textContent;
    expect(words).toContain("Preview");
    expect(words).toContain("gno.land/r/gov/dao · captured");
    expect(words).toContain("Open large");
  });

  it("cuts a long path's middle, as frame 104's plate does", () => {
    const box = card({ capture: { ...CAPTURE, path: "gno.land/r/sample/bubble" } });
    expect(opener(box).textContent).toContain("gno.land/r/…/bubble · captured");
  });

  it("draws the capture small as a picture: inert, hidden from assistive technology, its words the page's", () => {
    const thumb = one(card(), "[data-preview-thumb]");
    expect(thumb.hasAttribute("inert")).toBe(true);
    expect(thumb.getAttribute("aria-hidden")).toBe("true");
    expect(thumb.textContent).toContain("GovDAO");
    expect(thumb.textContent).toContain("Status: ACCEPTED");
  });

  it("puts nothing of the capture in the Tab order: the card is one button, its link and its fields none", () => {
    const box = card({ capture: { ...CAPTURE, text: HOSTILE } });
    // A closed dialog's contents are no Tab stops in a browser, which jsdom does not know: the open capture is its own test.
    const stops = all(box, "a[href], button, input, select, textarea, [tabindex]").filter(
      (element) => element.closest("[inert], dialog:not([open])") === null,
    );
    expect(stops).toEqual([opener(box)]);
  });

  it("draws a hostile page's words as words: no script, no image fetched, no script link, no form that sends", () => {
    const box = card({ capture: { ...CAPTURE, text: HOSTILE } });
    const thumb = one(box, "[data-preview-thumb]");
    // Its words are there, as words: the markup a reader of the page would see.
    expect(thumb.textContent).toContain("Welcome");
    expect(thumb.textContent).toContain("<script>alert(1)</script>");
    expect(thumb.textContent).toContain("click me");
    expect(box.querySelector("script, img, iframe, form, input")).toBeNull();
    expect(all(box, "a").filter((link) => link.getAttribute("href")?.startsWith("javascript:"))).toEqual([]);
    expect(all(box, "[src], [srcset]")).toEqual([]);
  });

  it("opens the capture at size, with when it was captured and the way to the page as it is now", () => {
    const box = card();
    expect(box.querySelector("dialog[open]")).toBeNull();
    click(opener(box));
    const dialog = one(box, "dialog");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("gno.land/r/gov/dao");
    expect(dialog.textContent).toContain("Prop #37");
    expect(one(dialog, "time").getAttribute("datetime")).toBe(CAPTURE.captured);
    const live = all(dialog, "a").find((link) => link.textContent === "Open the page");
    expect(live?.getAttribute("href")).toBe("/r/gov/dao");
  });

  it("opens a hostile capture at size with its links asking before they leave, and no form that sends", () => {
    const box = card({ capture: { ...CAPTURE, text: HOSTILE } });
    click(opener(box));
    const dialog = one(box, "dialog");
    expect(all(dialog, "a").filter((link) => (link.getAttribute("href") ?? "").includes("evil.example"))).toEqual([]);
    // The link off gnoweb is a button that asks first, naming where it goes (useExternalLinks).
    const away = all(dialog, "button").find((button) => button.textContent === "away");
    expect(away?.getAttribute("title")).toBe("https://evil.example/phish");
    expect(dialog.textContent).toContain("<script>alert(1)</script>");
    expect(dialog.querySelector("script, img, iframe, form")).toBeNull();
  });

  // Under a line, the card sits in the room's list, whose arrows move between lines (lineFocus.ts): a key in the open capture is its own.
  it("keeps the keys pressed in the open capture from the list it sits in", () => {
    const list = vi.fn();
    const box = mount(
      <ol onKeyDown={list}>
        <li>
          <PreviewCard capture={CAPTURE} look="line" gnoweb={GNOWEB} via={via} Blocks={Blocks} live="/r/gov/dao" />
        </li>
      </ol>,
    );
    click(opener(box));
    act(() => {
      one(box, "dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(list).not.toHaveBeenCalled();
    act(() => {
      opener(box).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(list).toHaveBeenCalledTimes(1);
  });
});
