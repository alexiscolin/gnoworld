// @vitest-environment jsdom
import type { Previews } from "@gnoworld/schemas/indexer";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { Preview } from "./Preview.tsx";

// A page's preview where a page asks for one (8f): the captures' file read, the page's capture found by its path, drawn as its card.
// No capture, no preview: a page the file does not hold, a file of another universe, or a file that could not be read draws nothing.
const CAPTURE = { path: "gno.land/r/gov/dao", captured: "2026-11-05T10:00:00.000Z", text: "# GovDAO\n" };
const FILE: Previews = { version: 1, universe: "onyx", updated: "2026-11-05T10:00:01.000Z", previews: [CAPTURE] };

// Drawn with its file, once the file was read and the chat's drawing came: the read resolving is the sync point of an absence.
async function drawn(path: string, file: Previews | undefined) {
  let read = false;
  const box = mount(
    <Preview
      path={path}
      look="plate"
      read={() => {
        read = true;
        return Promise.resolve(file);
      }}
    />,
  );
  await settled(() => read);
  await act(async () => {
    await import("../chat/Message.tsx");
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return box;
}

describe("Preview", () => {
  it("draws the capture of the page it is asked for", async () => {
    const box = await drawn("gno.land/r/gov/dao", FILE);
    await settled(() => box.querySelector("button[data-preview]") !== null);
    expect(box.querySelector("button[data-preview]")?.textContent).toContain("gno.land/r/gov/dao · captured");
  });

  it("links the page as it is now to its view on this site", async () => {
    const box = await drawn("gno.land/r/gov/dao", FILE);
    await settled(() => box.querySelector("button[data-preview]") !== null);
    expect(
      [...box.querySelectorAll("a")].find((link) => link.textContent === "Open the page")?.getAttribute("href"),
    ).toBe("/r/gov/dao");
  });

  it.each([
    ["a page the file does not hold", "gno.land/r/samcrew/memba", FILE],
    ["a file of another universe", "gno.land/r/gov/dao", { ...FILE, universe: "gnoland" }],
    ["a file that could not be read", "gno.land/r/gov/dao", undefined],
  ])("draws nothing for %s", async (_, path, file) => {
    const box = await drawn(path, file);
    expect(box.childElementCount).toBe(0);
  });

  it("draws nothing while the file comes", () => {
    const box = mount(<Preview path="gno.land/r/gov/dao" look="plate" read={() => new Promise(() => undefined)} />);
    expect(box.childElementCount).toBe(0);
  });
});
