// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, modals, noMedia, settled } from "../../../tests/mount.tsx";
import { mountInStore, type AppStore } from "../../../tests/inStore.tsx";
import { PassportCounter } from "./Counter.tsx";
import { PassportView } from "./PassportView.tsx";

// The passport (slice 8; ADR-0002 §1 and §3): the header's counter, the stamps out of the worlds the reader's view lists, the stamps alone
// before the count; the dialog's constellations, each world counted once, a constellation with no stamp not shown (no 0%), the worlds
// charted here, the stamps newest first.
const listed = vi.hoisted(() => ({
  count: undefined as number | null | undefined,
  worlds: undefined as { id: string; namespace: string }[] | undefined,
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

describe("the header's counter", () => {
  it("shows the stamps alone before the count is known", async () => {
    stamp({ "onyx:a/1": "2026-11-01", "onyx:a/2": "2026-11-02", "gnoland:a/1": "2026-11-02" });
    const box = await drawn(<PassportCounter universe="onyx" listed={undefined} onOpen={() => undefined} />);
    expect(text(box)).toBe("Passport 2");
  });

  it("shows the stamps out of the worlds listed, and opens the passport", async () => {
    stamp({ "onyx:a/1": "2026-11-01", "onyx:a/2": "2026-11-02", "onyx:a/3": "2026-11-02" });
    const open = vi.fn();
    const box = await drawn(<PassportCounter universe="onyx" listed={19} onOpen={open} />);
    expect(text(box)).toBe("Passport 3/19");
    act(() => {
      all(box, "button")[0]?.click();
    });
    expect(open).toHaveBeenCalledOnce();
  });

  it("counts a new stamp at once, with no reload", async () => {
    const box = await drawn(<PassportCounter universe="onyx" listed={18} onOpen={() => undefined} />);
    expect(text(box)).toBe("Passport 0/18");
    act(() => {
      store?.getState().deviceActions.change("stamps", (held) => ({ ...held, "onyx:a/1": "2026-11-05" }));
    });
    expect(text(box)).toBe("Passport 1/18");
  });
});

describe("the passport dialog", () => {
  const open = () => <PassportView universe="onyx" open onClose={() => undefined} />;

  it("shows the stamps out of the worlds listed", async () => {
    stamp({ "onyx:gov/dao": "2026-11-01", "onyx:games/chess": "2026-11-04" });
    listed.count = 19;
    const box = await drawn(open());
    const bar = all(box, "[role='progressbar']").find(
      (each) => each.getAttribute("aria-label") === "Worlds you visited",
    );
    expect(bar?.getAttribute("aria-valuenow")).toBe("2");
    expect(bar?.getAttribute("aria-valuemax")).toBe("19");
    expect(text(box)).toContain("2/19");
  });

  it("shows each constellation started, its worlds counted once, and none with no stamp", async () => {
    stamp({ "onyx:gov/dao": "2026-11-01" });
    listed.count = 4;
    listed.worlds = [
      { id: "gov/dao", namespace: "gov" },
      { id: "gov/boards", namespace: "gov" },
      { id: "gov/dao", namespace: "gov" },
      { id: "games/chess", namespace: "games" },
    ];
    const box = await drawn(open());
    const constellations = all(box, "[role='progressbar']").filter((each) =>
      each.getAttribute("aria-label")?.startsWith("Constellation"),
    );
    expect(constellations.map((each) => each.getAttribute("aria-label"))).toEqual(["Constellation gov"]);
    expect(constellations[0]?.getAttribute("aria-valuemax")).toBe("2");
    expect(text(box)).toContain("1 still to visit");
    expect(text(box)).not.toContain("games");
    expect(text(box)).not.toContain("0/");
  });

  it("shows no constellation and no 0% on a passport with no stamp", async () => {
    listed.count = 4;
    listed.worlds = [{ id: "gov/dao", namespace: "gov" }];
    const box = await drawn(open());
    expect(text(box)).not.toContain("Constellations");
    expect(text(box)).toContain("No stamp yet");
  });

  it("lists the stamps newest first, and the worlds charted here", async () => {
    stamp(
      { "onyx:gov/dao": "2026-11-01", "onyx:games/chess": "2026-11-04", "gnoland:x/y": "2026-11-05" },
      { "onyx:games/chess": "2026-11-04" },
    );
    const box = await drawn(open());
    const stamps = all(box, "section[aria-labelledby='passport-stamps'] li").map(text);
    expect(stamps).toHaveLength(2);
    expect(stamps[0]).toContain("Nov 4, 2026");
    expect(stamps[1]).toContain("Nov 1, 2026");
    const firsts = all(box, "section[aria-labelledby='passport-firsts'] li").map(text);
    expect(firsts).toHaveLength(1);
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
