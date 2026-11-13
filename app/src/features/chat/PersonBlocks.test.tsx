// @vitest-environment jsdom
import type { PersonCardData } from "@gnoworld/schemas/indexer";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount, noMedia, settled } from "../../../tests/mount.tsx";
import { queryClient } from "../../lib/query/client.ts";
import { dailyCalls, figureOf, middle, realmIn, wholeGnot } from "./personData.ts";
import { PersonBody } from "./PersonBody.tsx";
import { personOptions } from "./personQueries.ts";

// A person's tabs: each card says when it has nothing, a stranger's text as text, the balance written from its integer.
const ADDRESS = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const bidi = String.fromCodePoint(0x202e);
const card = (over: Partial<PersonCardData> = {}): PersonCardData => ({
  balance: { state: "ok", ugnot: "275208694" },
  system: { worlds: [], more: 0 },
  calls: null,
  latest: [],
  tokens: [],
  ...over,
});
const draw = (seed: PersonCardData) => {
  queryClient.setQueryData(personOptions(ADDRESS).queryKey, seed);
  return mount(
    <MemoryRouter>
      <PersonBody address={ADDRESS} />
    </MemoryRouter>,
  );
};
// A tab opened by a press on its name, its cards (a chunk of their own) drawn.
const open = async (box: HTMLElement, name: string, holds: string) => {
  const tab = all(box, '[role="tab"]').find((each) => each.textContent === name);
  act(() => {
    tab?.click();
  });
  await settled(() => box.textContent.includes(holds));
};
beforeEach(() => {
  noMedia();
});
afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("a person's tabs", () => {
  it("draws the figures at once, a skeleton for each until the read comes, and the tabs", () => {
    const box = mount(
      <MemoryRouter>
        <PersonBody address={ADDRESS} />
      </MemoryRouter>,
    );
    expect(all(box, '[role="tab"]').map((each) => each.textContent)).toEqual(["Activity", "Worlds", "Tokens"]);
    expect(all(box, '[role="tabpanel"] [data-shape="card"]')).toHaveLength(2);
    expect(all(box, "[data-value]")).toHaveLength(0);
  });

  it("draws zeros as zeros and says each empty card in one line", async () => {
    const box = draw(card());
    expect(box.textContent).toContain("275 GNOT");
    expect(all(box, '[data-value="0"]')).toHaveLength(2);
    await settled(() => box.textContent.includes("No calls yet."));
    expect(box.textContent).toContain("No calls to worlds yet.");
    await open(box, "Worlds", "No realms deployed yet.");
    await open(box, "Tokens", "No tokens held.");
  });

  it("says the balance unavailable, never 0, and draws none for an address with no account", () => {
    expect(draw(card({ balance: { state: "unavailable" } })).textContent).toContain("Balance unavailable");
    expect(draw(card({ balance: { state: "none" } })).textContent).not.toContain("GNOT");
  });

  it("draws the tokens held with their amounts in the token's own unit", async () => {
    const box = draw(
      card({ tokens: [{ realm: "gno.land/r/w/tok", symbol: "WUGNOT", decimals: 6, amount: "1234500000" }] }),
    );
    await open(box, "Tokens", "WUGNOT");
    expect(box.textContent).toContain("1,234.5");
    expect(all(box, "[title]").some((each) => each.getAttribute("title") === "1,234.5")).toBe(true);
  });

  it("draws a world's title as text, its bidi controls stripped", async () => {
    const box = draw(
      card({
        system: {
          worlds: [{ world: "w", title: `<img src=x onerror=alert(1)>${bidi}evil`, realm: "gno.land/r/w/x" }],
          more: 2,
        },
      }),
    );
    await open(box, "Worlds", "evil");
    expect(box.textContent).toContain("<img src=x onerror=alert(1)>evil");
    expect(all(box, "img[src*='onerror']")).toHaveLength(0);
    expect(box.textContent).not.toContain(bidi);
    expect(box.textContent).toContain("2 more");
  });

  it("shows the first five latest calls and the rest on a press of Show N more", async () => {
    const latest = Array.from({ length: 8 }, (_, at) => ({
      realm: "gno.land/r/w/x",
      func: `Call${String(at)}`,
      success: true,
      time: null,
    }));
    const box = draw(card({ latest }));
    await settled(() => box.textContent.includes("Call4"));
    expect(box.textContent).not.toContain("Call5");
    const more = all(box, "button").find((each) => each.textContent === "Show 3 more");
    expect(more).toBeDefined();
    act(() => {
      more?.click();
    });
    expect(box.textContent).toContain("Call7");
    expect(box.textContent).not.toContain("Show 3 more");
  });

  it("marks a failed call, each call one row", async () => {
    const box = draw(
      card({
        calls: { total: 1, realms: 1, days: [] },
        latest: [{ realm: "gno.land/r/w/x", func: "Mint", success: false, time: null }],
      }),
    );
    await settled(() => box.textContent.includes("Mint"));
    expect(box.textContent).toContain("Failed");
  });
});

describe("the card's values", () => {
  it("writes the whole GNOT of a balance, exact past 2^53", () => {
    expect(wholeGnot("0")).toBe(0);
    expect(wholeGnot("999999")).toBe(0);
    expect(wholeGnot("275208694")).toBe(275);
    expect(wholeGnot("9223372036854775807")).toBe(9_223_372_036_854);
  });

  it("writes a realm relative to the person's namespace, an address by its two ends", () => {
    const own = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    expect(realmIn(`gno.land/r/${own}/bazaar`, own)).toBe("bazaar");
    expect(realmIn("gno.land/r/demo/boards", own)).toBe("r/demo/boards");
    expect(realmIn(`gno.land/r/${own}/x`, "")).toMatch(/^r\/g10gh7.*y5tv\/x$/);
    expect(realmIn(`gno.land/r/${own}/x`, "")).not.toContain(own);
  });

  it("cuts a long text in its middle to the length asked, both ends kept", () => {
    expect(middle("short", 10)).toBe("short");
    const cut = middle("r/demo/some/very/long/realm/path/name", 20);
    expect(cut).toHaveLength(20);
    expect(cut.startsWith("r/demo/")).toBe(true);
    expect(cut.endsWith("/name")).toBe(true);
    expect(cut).toContain("\u2026");
  });

  it("writes a token amount whole while short and compact when long", () => {
    expect(figureOf("500", 2)).toBe("5");
    expect(figureOf("82090000", 2)).toBe("820,900");
    expect(figureOf("123456789000000", 6)).toBe("123M");
  });

  it("lays the days on the last 30 UTC days, a day with none counting 0", () => {
    const now = Date.parse("2026-11-12T10:00:00Z");
    const values = dailyCalls(
      [
        { day: "2026-11-12", calls: 3 },
        { day: "2026-10-14", calls: 1 },
        { day: "2026-10-13", calls: 9 },
      ],
      now,
    );
    expect(values).toHaveLength(30);
    expect(values[29]).toBe(3);
    expect(values[0]).toBe(1);
    expect(values.reduce((a, b) => a + b)).toBe(4);
  });
});
