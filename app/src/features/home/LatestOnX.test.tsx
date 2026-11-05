// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { LatestOnX } from "./LatestOnX.tsx";
import { stampOf } from "./stamp.ts";

// The Earth's "LATEST ON X" (frame 40): the newest post the team copied by hand, its handle, words, clock time and address on X; a row
// written as an example says "Sample"; with none, no card.
const data = vi.hoisted(() => ({
  posts: [] as { id: string; handle: string; text: string; at: string; link: string; sample?: boolean }[],
}));
vi.mock("../../../data/xPosts.json", () => ({
  get default() {
    return data.posts;
  },
}));

const NOW = new Date("2026-11-05T12:00:00.000Z");
const post = (id: string, at: string, extra: { sample?: boolean } = {}) => ({
  id,
  handle: `@${id}`,
  text: `Words of ${id}`,
  at,
  link: `https://x.com/${id}/status/1`,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the latest post on X", () => {
  it("draws nothing, not even its heading, with no post", () => {
    data.posts = [];
    expect(mount(<LatestOnX />).textContent).toBe("");
  });

  it("shows the newest post whatever the order of the file, with its words and a link out", () => {
    data.posts = [
      post("old", "2026-11-01T10:00:00Z"),
      post("new", "2026-11-04T10:00:00Z"),
      post("mid", "2026-11-02T10:00:00Z"),
    ];
    const box = mount(<LatestOnX />);
    expect(box.textContent).toContain("@new");
    expect(box.textContent).toContain("Words of new");
    expect(box.textContent).not.toContain("Words of old");
    const link = box.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://x.com/new/status/1");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("says its time as a clock time and never an age", () => {
    data.posts = [post("new", "2026-11-04T10:00:00Z")];
    const box = mount(<LatestOnX />);
    const time = box.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-11-04T10:00:00Z");
    expect(time?.textContent).toBe(stampOf("2026-11-04T10:00:00Z", NOW));
    expect(time?.textContent).toMatch(/UTC$/);
  });

  it("says Sample for a row written as an example, and only for it", () => {
    data.posts = [post("new", "2026-11-04T10:00:00Z", { sample: true })];
    expect(mount(<LatestOnX />).textContent).toContain("Sample");
    data.posts = [post("new", "2026-11-04T10:00:00Z")];
    expect(mount(<LatestOnX />).textContent).not.toContain("Sample");
  });
});
