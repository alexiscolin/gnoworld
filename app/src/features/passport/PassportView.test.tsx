// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, button, click, modals, noMedia, one, settled } from "../../../tests/mount.tsx";
import { mountInStore, type AppStore } from "../../../tests/inStore.tsx";
import { PassportView } from "./PassportView.tsx";

// The passport: its figures, the three tabs (Challenges first), the stamps by day with the rest one press away, a stamp for each world id so
// two worlds of one name are two stamps naming their systems, the stamps charted first.
const listed = vi.hoisted(() => ({
  count: undefined as number | null | undefined,
  worlds: undefined as { id: string; namespace: string; nature?: string }[] | undefined,
}));
vi.mock("../universe/index.ts", () => ({ useWorldsCount: () => listed.count }));
vi.mock("../../worldsFile.ts", () => ({ useWorldsFile: () => listed.worlds }));

beforeAll(modals);
beforeEach(() => {
  noMedia();
  localStorage.clear();
  listed.count = undefined;
  listed.worlds = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

let store: AppStore | undefined;
async function drawn(element: React.ReactElement) {
  const mounted = await mountInStore(element);
  store = mounted.store;
  const box = mounted.box;
  await settled(() => store?.getState().device.readable === true);
  return box;
}
const stamp = (stamps: Record<string, string>, charted: Record<string, string> = {}) => {
  localStorage.setItem("gnoworld:device:stamps", JSON.stringify(stamps));
  localStorage.setItem("gnoworld:device:charted", JSON.stringify(charted));
};
const text = (element: Element) => element.textContent.replaceAll(/\s+/g, " ").trim();

const tab = (box: HTMLElement, name: string) =>
  all(box, "[role='tab']").find((each) => each.textContent.startsWith(name));
const marks = (box: HTMLElement) =>
  all(box, "[role='tabpanel'] svg[role='img']").map((each) => each.getAttribute("aria-label"));

// The dialog left mounted, its `open` turned by a button.
function Toggled() {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShown(!shown);
        }}
      >
        toggle
      </button>
      <PassportView universe="onyx" open={shown} onClose={() => undefined} />
    </>
  );
}

describe("the passport dialog", () => {
  const open = () => <PassportView universe="onyx" open onClose={() => undefined} />;
  // The day is "4 Nov" in the current year: the clock is the test's.
  const today = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  };

  it("counts the stamps out of the worlds listed, and the systems and the worlds charted first", async () => {
    stamp(
      { "onyx:gov/dao": "2026-11-01", "onyx:games/chess": "2026-11-04", "onyx:games/go": "2026-11-04" },
      { "onyx:games/chess": "2026-11-04" },
    );
    listed.count = 19;
    listed.worlds = [];
    const box = await drawn(open());
    expect(text(box)).toMatch(/3\s*\/19\s*stamps/i);
    expect(text(box)).toMatch(/2\s*systems/i);
    expect(text(box)).toMatch(/1\s*charted first/i);
  });

  it("opens on Challenges, first of three tabs, the stamps and the charted ones counted", async () => {
    stamp({ "onyx:gov/dao": "2026-11-01", "onyx:games/chess": "2026-11-04" }, { "onyx:games/chess": "2026-11-04" });
    const box = await drawn(open());
    const tabs = all(box, "[role='tab']");
    expect(tabs.map((each) => each.textContent.trim())).toEqual(["Challenges", "Stamps 2", "Charted 1"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(all(box, "svg[role='img']")[0]?.getAttribute("aria-label")).toBe("onyx, earned");
  });

  it("names the open tab's panel by its tab", async () => {
    stamp({ "onyx:gov/dao": "2026-11-01" }, {});
    const box = await drawn(open());
    click(tab(box, "Stamps"));
    const panel = one(box, "[role='tabpanel']");
    expect(panel.getAttribute("aria-labelledby")).toBe(tab(box, "Stamps")?.id);
    expect(tab(box, "Stamps")?.id).toBeTruthy();
  });

  it("shows no stamp and no 0% on a passport with none", async () => {
    listed.count = 4;
    const box = await drawn(open());
    click(tab(box, "Stamps"));
    expect(text(box)).toContain("No stamp yet");
    expect(text(box)).not.toContain("0%");
  });

  it("groups the stamps by day, newest first, as the app writes days", async () => {
    today();
    stamp({
      "onyx:a/one": "2026-11-12",
      "onyx:a/two": "2026-11-11",
      "onyx:gov/dao": "2026-11-01",
      "onyx:games/chess": "2026-11-04",
      "gnoland:x/y": "2026-11-05",
    });
    const box = await drawn(open());
    click(tab(box, "Stamps"));
    const days = all(box, "section p.label").map(text);
    expect(days).toEqual(["Today · 1 stamp", "Yesterday · 1 stamp", "4 Nov · 1 stamp", "1 Nov · 1 stamp"]);
    expect(marks(box)).toHaveLength(4);
  });

  it("takes the day again each time it opens, so a passport left mounted past midnight shows the new day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T23:00:00Z"));
    stamp({ "onyx:a/one": "2026-11-12" });
    const box = await drawn(<Toggled />);
    click(tab(box, "Stamps"));
    expect(all(box, "section p.label").map(text)).toEqual(["Today · 1 stamp"]);
    click(button(box, "toggle"));
    vi.setSystemTime(new Date("2026-11-13T01:00:00Z"));
    click(button(box, "toggle"));
    click(tab(box, "Stamps"));
    expect(all(box, "section p.label").map(text)).toEqual(["Yesterday · 1 stamp"]);
  });

  it("shows seven stamps of a day and the rest after Show N more", async () => {
    today();
    stamp(Object.fromEntries(Array.from({ length: 10 }, (_, at) => [`onyx:ns/w${String(at)}`, "2026-11-12"])));
    const box = await drawn(open());
    click(tab(box, "Stamps"));
    expect(marks(box)).toHaveLength(7);
    click(all(box, "button").find((each) => each.textContent === "Show 3 more"));
    expect(marks(box)).toHaveLength(10);
    expect(all(box, "button").some((each) => each.textContent.startsWith("Show"))).toBe(false);
  });

  it("shows seven of the stamps charted first and the rest after Show N more", async () => {
    today();
    const days = Object.fromEntries(Array.from({ length: 10 }, (_, at) => [`onyx:ns/w${String(at)}`, "2026-11-12"]));
    stamp(days, days);
    const box = await drawn(open());
    click(tab(box, "Charted"));
    expect(marks(box)).toHaveLength(7);
    click(all(box, "button").find((each) => each.textContent === "Show 3 more"));
    expect(marks(box)).toHaveLength(10);
  });

  it("keeps two worlds of one name apart, each stamp naming its system", async () => {
    stamp({ "onyx:nym-ana/hello": "2026-11-05", "onyx:g1abc/hello": "2026-11-05" });
    listed.worlds = [
      { id: "nym-ana/hello", namespace: "nym-ana", nature: "game" },
      { id: "g1abc/hello", namespace: "g1abc" },
    ];
    const box = await drawn(open());
    click(tab(box, "Stamps"));
    expect(marks(box).toSorted()).toEqual([
      expect.stringContaining("hello, g1abc, stamped"),
      expect.stringContaining("hello, nym-ana, stamped"),
    ]);
    expect(text(box)).toMatch(/2\s*systems/i);
  });

  it("lists the worlds charted first in gold in their tab", async () => {
    stamp({ "onyx:gov/dao": "2026-11-01", "onyx:games/chess": "2026-11-04" }, { "onyx:games/chess": "2026-11-04" });
    const box = await drawn(open());
    click(tab(box, "Charted"));
    expect(marks(box)).toHaveLength(1);
    expect(marks(box)[0]).toContain("charted first");
    expect(all(box, "svg[data-gold]")).toHaveLength(1);
  });

  it("says when the device did not keep the last change", async () => {
    const box = await drawn(open());
    expect(text(box)).toContain("Export or clear it in the settings");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    act(() => {
      store?.getState().deviceActions.change("stamps", () => ({ "onyx:a/1": "2026-11-05" }));
    });
    vi.restoreAllMocks();
    expect(text(box)).toContain("This device did not keep the last change");
  });
});
