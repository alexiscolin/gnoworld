// @vitest-environment jsdom
import type { CallDetail as Detail } from "@gnoworld/schemas";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount, noMedia, one } from "../../../tests/mount.tsx";
import { queryClient } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { callOptions } from "./callQueries.ts";
import CallDetail from "./CallDetail.tsx";

// A call's detail in the panel: each block only when it has something, a failed call's error, a stranger's text as text, a failed read as the
// shared inline error.
const HASH = "ee2jB-mHq8SSTv19Z50gOsyXAJnhW2MqTn_JhkErVss";
const bidi = String.fromCodePoint(0x202e);
const detail = (over: Partial<Detail> = {}): Detail => ({
  height: 1075087,
  time: "2026-11-12T03:59:00.000Z",
  caller: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv" as Detail["caller"],
  realm: "gno.land/r/gov/dao",
  func: "Vote",
  success: true,
  error: null,
  gas: { used: 3132928, wanted: 4072728 },
  fee: { amount: 8146, denom: "ugnot" },
  send: null,
  memo: null,
  args: [],
  moreArgs: 0,
  events: [],
  moreEvents: 0,
  ...over,
});
const draw = (seed: Detail | undefined) => {
  if (seed !== undefined) queryClient.setQueryData(callOptions(HASH, 0).queryKey, seed);
  return mount(
    <MemoryRouter>
      <CallDetail hash={HASH} index={0} />
    </MemoryRouter>,
  );
};
beforeEach(() => {
  noMedia();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a call's detail", () => {
  it("draws the function, its realm, its block and time, its gas and fee, and no block of what it lacks", () => {
    const box = draw(detail());
    expect(box.textContent).toContain("Vote");
    expect(box.textContent).toContain("Succeeded");
    expect(box.textContent).toContain("block 1,075,087 · 2026-11-12 03:59 UTC");
    expect(box.textContent).toContain("of 4,072,728 wanted; fee 8,146 ugnot");
    for (const absent of ["Arguments", "Events", "Memo", "Sent"]) expect(box.textContent).not.toContain(absent);
  });

  it("says a failed call failed, with the chain's error, and counts the arguments and events it left out", () => {
    const box = draw(
      detail({
        success: false,
        error: "panic: out of gas",
        args: ["1", "2"],
        moreArgs: 3,
        events: [{ type: "Voted", attrs: [{ key: "id", value: "1" }] }],
        moreEvents: 2,
        memo: "hello",
        send: "5ugnot",
      }),
    );
    expect(box.textContent).toContain("Failed");
    expect(box.textContent).toContain("panic: out of gas");
    expect(box.textContent).toContain("1: 2");
    expect(box.textContent).toContain("and 3 more");
    expect(box.textContent).toContain("Voted (id: 1)");
    expect(box.textContent).toContain("and 2 more");
    expect(box.textContent).toContain("Memo: hello");
    expect(box.textContent).toContain("Sent 5ugnot");
  });

  it("draws a stranger's text as text, stripped of bidi and cut, never as markup", () => {
    const box = draw(
      detail({ memo: `<img src=x onerror=1>${bidi}`, args: [`<b>${bidi}${"a".repeat(5000)}`], func: `Vo${bidi}te` }),
    );
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector("b")).toBeNull();
    expect(box.textContent).not.toContain(bidi);
    expect(box.textContent).toContain("<img src=x onerror=1>");
    expect(box.textContent.length).toBeLessThan(700);
  });

  it("shows the shared inline error, with a way to ask again, when the server has no such call", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ error: "not_found" }, { status: 404 })));
    const box = draw(undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(one(box, "[role='status']").textContent).toContain("Nothing here goes by that name.");
    expect(all(box, "button").map((button) => button.textContent)).toContain("Try again");
    expect(queryClient.getQueryState(keys.call(HASH, 0))?.status).toBe("error");
  });
});
