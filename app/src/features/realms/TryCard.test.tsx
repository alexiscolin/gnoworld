// @vitest-environment jsdom
import { queryEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { ChainFetch } from "@gnoworld/chain/read";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { CHAIN, CUR, field } from "../../../tests/callFixtures.ts";
import { all, button, click, mount, noMedia, one, settled } from "../../../tests/mount.tsx";
import { CallCountsContext } from "./FunctionRow.tsx";
import { TryCard } from "./TryCard.tsx";

// Try it: the Read and Write tabs with their counts, Start here's Call, and a row's Read. The function list is NOT recorded: it is
// written in the shape of vm/qfuncs.
const FUNCTIONS = [
  { FuncName: "SetBio", Params: [CUR, field("bio", "string")], Results: null },
  { FuncName: "Deposit", Params: [CUR], Results: null },
  { FuncName: "Upload", Params: [CUR, field("data", "[]uint8")], Results: null },
  { FuncName: "TotalSupply", Params: null, Results: [field(".res.0", "int64")] },
  { FuncName: "Owner", Params: null, Results: [field(".res.0", "string")] },
];
const fetcher: ChainFetch = (input) => {
  const path = decodeURIComponent(new URL(input).searchParams.get("path") ?? "");
  const data = path.includes("qeval") ? "(1238848006 int64)" : JSON.stringify(FUNCTIONS);
  return Promise.resolve(new Response(JSON.stringify(queryEnvelope({ data }))));
};

async function card(counts: [string, number][] = []) {
  const box = mount(
    <StoreProvider>
      <CallCountsContext value={new Map(counts)}>
        <TryCard realm="gno.land/r/demo/profile" chain={CHAIN} options={{ fetch: fetcher }} />
      </CallCountsContext>
    </StoreProvider>,
  );
  await settled(() => all(box, "[role=tab]").every((tab) => /\d/.test(tab.textContent)));
  return box;
}
const tab = (box: HTMLElement, name: string) => all(box, "[role=tab]").find((t) => t.textContent.startsWith(name));
const panels = (box: HTMLElement) => all(box, "[role=tabpanel]");

describe("Try it", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts the read functions and the writes a call can carry, each on its tab; a write only gnoweb can take is listed, not counted", async () => {
    const box = await card();
    expect(tab(box, "Read")?.textContent).toBe("Read 2");
    expect(tab(box, "Write")?.textContent).toBe("Write 2");
    const rows = all(panels(box)[1] ?? box, "button[aria-expanded]").map((row) => row.textContent);
    expect(rows).toEqual(["SetBio(cur realm, bio string)", "Deposit(cur realm)", "Upload(cur realm, data []uint8)"]);
  });

  it("draws no foot that counts a list of twelve rows or fewer", async () => {
    expect((await card()).textContent).not.toMatch(/\d+ of \d+/);
  });

  it("shows the Read list first and the Write list when its tab is chosen, never both", async () => {
    const box = await card();
    const [read, write] = panels(box);
    expect([read?.hidden, write?.hidden]).toEqual([false, true]);
    click(tab(box, "Write"));
    expect([read?.hidden, write?.hidden]).toEqual([true, false]);
  });

  it("says nothing of where to start until a write has been called", async () => {
    expect((await card()).textContent).not.toContain("Start here");
  });

  it("opens the most called write's row from Start here, on the Write tab, a read never being the place to start", async () => {
    noMedia();
    Element.prototype.scrollIntoView = vi.fn();
    const box = await card([
      ["SetBio", 3],
      ["Deposit", 1200],
      ["TotalSupply", 5000],
    ]);
    // A read is never the place to start, whatever its count.
    expect(box.textContent).toContain("Most people start with Deposit (1,200 calls).");
    click(button(box, "Call Deposit"));
    const [, write] = panels(box);
    expect(write?.hidden).toBe(false);
    const row = all(write ?? box, "button").find((b) => b.textContent.startsWith("Deposit("));
    expect(row?.getAttribute("aria-expanded")).toBe("true");
    // The Call card is open at once, not behind a second Call.
    expect(one(write ?? box, "article").textContent).toContain("Deposit");
    // Shut by the person, a second press opens the row again.
    click(row);
    expect(row?.getAttribute("aria-expanded")).toBe("false");
    click(button(box, "Call Deposit"));
    expect(
      all(write ?? box, "button")
        .find((b) => b.textContent.startsWith("Deposit("))
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("reads a row's function when its Read is clicked, and shows the result", async () => {
    const box = await card();
    const [read] = panels(box);
    click(button(read ?? box, "Read TotalSupply"));
    await settled(() => (read?.textContent ?? "").includes("(1238848006 int64)"));
    expect(read?.textContent).toContain("read on chain, free, no signature");
  });

  it("reads on the row's own click, with no second one, and keeps the Read button for a read again", async () => {
    const box = await card();
    const [read] = panels(box);
    click(all(read ?? box, "button[aria-expanded]").find((b) => b.textContent.startsWith("TotalSupply(")));
    await settled(() => (read?.textContent ?? "").includes("(1238848006 int64)"));
    expect(button(read ?? box, "Read TotalSupply")).toBeDefined();
  });
});
