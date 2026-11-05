// @vitest-environment jsdom
import { SNAPSHOT_EVENT, SNAPSHOT_TAKEN } from "@gnoworld/core";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { all, modals, one } from "../../../tests/mount.tsx";
import { ORIGIN } from "../../meta.ts";
import { linkOf } from "./link.ts";
import { openShare } from "./ShareSheet.tsx";

// Share (slice 8; the plan's threat model, "Share"): the link is the place's public URL and nothing else; the picture is the scene's canvas
// alone, none without a scene; the sheet works without the device's share sheet, canShare or a clipboard; closing the device's sheet is no
// fault.
const place = { name: "Bubble", path: "/w/bubble" };

beforeAll(modals);
const owned: string[] = [];
const give = (name: string, value: unknown) => {
  Object.defineProperty(navigator, name, { value, configurable: true });
  owned.push(name);
};
afterEach(() => {
  vi.useRealTimers();
  for (const name of owned.splice(0)) Reflect.deleteProperty(navigator, name);
  for (const canvas of all(document, "canvas")) canvas.remove();
});

const settle = async () => {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
};
async function opened(shared = place) {
  await act(async () => {
    openShare(shared);
    await Promise.resolve();
  });
  await settle();
  const dialogs = all(document, "dialog").filter((dialog) => dialog.hasAttribute("open"));
  expect(dialogs).toHaveLength(1);
  return dialogs[0] ?? document.body;
}
// A scene that is on and answers with a frame whose picture is a one-byte JPEG.
function answeringScene() {
  const scene = document.createElement("canvas");
  scene.dataset["scene"] = "on";
  document.body.append(scene);
  const frame = document.createElement("canvas");
  vi.spyOn(frame, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAAA");
  vi.spyOn(frame, "toBlob").mockImplementation((done) => {
    done(new Blob(["x"], { type: "image/jpeg" }));
  });
  scene.addEventListener(SNAPSHOT_EVENT, () => {
    scene.dispatchEvent(new CustomEvent(SNAPSHOT_TAKEN, { detail: frame }));
  });
  return scene;
}
const pressed = async (sheet: HTMLElement, words: string) => {
  const found = all(sheet, "button").find((each) => each.textContent.includes(words));
  expect(found, words).toBeDefined();
  await act(async () => {
    found?.click();
    await Promise.resolve();
  });
  await settle();
};

describe("a shared place's link", () => {
  it("is the site's origin and the page's path, exactly", () => {
    expect(linkOf(place)).toBe(`${ORIGIN}/w/bubble`);
    expect(linkOf({ name: "noor's room g1abc token=1", path: "/r/demo/x" })).toBe(`${ORIGIN}/r/demo/x`);
  });
});

describe("the share sheet", () => {
  it("shows the link alone and no picture when the page has no scene", async () => {
    const sheet = await opened();
    expect(sheet.textContent).toContain(`${ORIGIN}/w/bubble`);
    expect(all(sheet, "figure")).toHaveLength(0);
    expect(all(sheet, "img")).toHaveLength(0);
  });

  it("takes the scene's canvas alone as its picture, never the page around it", async () => {
    answeringScene();
    const sheet = await opened();
    expect(one(sheet, "img").getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    expect(one(sheet, "figcaption").textContent).toContain("Bubble");
  });

  it("shows no picture when the scene answers with no canvas", async () => {
    const scene = document.createElement("canvas");
    scene.dataset["scene"] = "on";
    document.body.append(scene);
    scene.addEventListener(SNAPSHOT_EVENT, () => {
      scene.dispatchEvent(new CustomEvent(SNAPSHOT_TAKEN, { detail: "not a canvas" }));
    });
    const sheet = await opened();
    expect(all(sheet, "figure")).toHaveLength(0);
  });

  it("asks no picture of a scene that is off (covered, lost or failed)", async () => {
    const scene = document.createElement("canvas");
    scene.dataset["scene"] = "off";
    document.body.append(scene);
    const asked = vi.fn();
    scene.addEventListener(SNAPSHOT_EVENT, asked);
    const sheet = await opened();
    expect(asked).not.toHaveBeenCalled();
    expect(all(sheet, "figure")).toHaveLength(0);
  });

  it("has no Share… without the device's share sheet, and copies with the clipboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    give("clipboard", { writeText });
    const sheet = await opened();
    expect(all(sheet, "button").some((each) => each.textContent.includes("Share…"))).toBe(false);
    await pressed(sheet, "Copy link");
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/w/bubble`);
    expect(sheet.textContent).toContain("Link copied");
  });

  it("says to select the link when there is no clipboard, or it refuses", async () => {
    const sheet = await opened();
    await pressed(sheet, "Copy link");
    expect(sheet.textContent).toContain("Could not copy: select the link above");
    give("clipboard", { writeText: () => Promise.reject(new Error("denied")) });
    const again = await opened();
    await pressed(again, "Copy link");
    expect(again.textContent).toContain("Could not copy");
  });

  it("shares the name, its words and the link, with no file where canShare is absent", async () => {
    const share = vi.fn(() => Promise.resolve());
    give("share", share);
    const sheet = await opened();
    await pressed(sheet, "Share…");
    expect(share).toHaveBeenCalledWith({ title: "Bubble", text: "Bubble on gnoworld", url: `${ORIGIN}/w/bubble` });
  });

  it.each([
    ["Bubble", "bubble.jpg"],
    ["GovDAO Hub!", "govdao-hub.jpg"],
    ["★ ☆", "gnoworld.jpg"],
  ])("shares the picture as a file named from %s when the device can share files", async (name, file) => {
    answeringScene();
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    const canShare = vi.fn(() => true);
    give("share", share);
    give("canShare", canShare);
    const sheet = await opened({ name, path: "/w/x" });
    await pressed(sheet, "Share…");
    const data: unknown = share.mock.calls[0]?.[0];
    expect(data).toEqual({
      title: name,
      text: `${name} on gnoworld`,
      url: `${ORIGIN}/w/x`,
      files: [expect.objectContaining({ name: file, type: "image/jpeg" })],
    });
    expect(canShare).toHaveBeenCalledWith(data);
  });

  it("shares no file when the device cannot share one", async () => {
    answeringScene();
    const share = vi.fn(() => Promise.resolve());
    give("share", share);
    give("canShare", () => false);
    const sheet = await opened();
    await pressed(sheet, "Share…");
    expect(share).toHaveBeenCalledWith({ title: "Bubble", text: "Bubble on gnoworld", url: `${ORIGIN}/w/bubble` });
  });

  it("waits 1,500 ms for a scene that never answers, then shows no picture and shares the link alone", async () => {
    const scene = document.createElement("canvas");
    scene.dataset["scene"] = "on";
    document.body.append(scene);
    const share = vi.fn(() => Promise.resolve());
    give("share", share);
    vi.useFakeTimers();
    await act(async () => {
      openShare(place);
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_499);
    });
    const sheet = one(document, "dialog[open]");
    const press = () =>
      act(async () => {
        all(sheet, "button")
          .find((each) => each.textContent.includes("Share…"))
          ?.click();
        await vi.advanceTimersByTimeAsync(0);
      });
    const button = () => one(sheet, "button[aria-busy]");
    expect(all(sheet, "figure")).toHaveLength(1);
    expect(button().getAttribute("aria-busy")).toBe("true");
    await press();
    expect(share).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(all(sheet, "figure")).toHaveLength(0);
    expect(button().getAttribute("aria-busy")).not.toBe("true");
    await press();
    expect(share).toHaveBeenCalledWith({ title: "Bubble", text: "Bubble on gnoworld", url: `${ORIGIN}/w/bubble` });
  });

  it("takes the device's sheet closed (AbortError) as no fault, and says any other failure", async () => {
    give("share", () => Promise.reject(new DOMException("closed", "AbortError")));
    const sheet = await opened();
    await pressed(sheet, "Share…");
    expect(sheet.textContent).not.toContain("Could not share");
    give("share", () => Promise.reject(new DOMException("no", "NotAllowedError")));
    const again = await opened();
    await pressed(again, "Share…");
    expect(again.textContent).toContain("Could not share from this device");
  });

  it("opens one sheet at a time: a second share replaces the first", async () => {
    await opened();
    const second = await opened({ name: "GovDAO", path: "/w/govdao" });
    expect(second.textContent).toContain(`${ORIGIN}/w/govdao`);
  });
});
