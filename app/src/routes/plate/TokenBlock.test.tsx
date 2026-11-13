// @vitest-environment jsdom
import type { TokenAnswer } from "@gnoworld/schemas/indexer";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, noMedia, noObservers } from "../../../tests/mount.tsx";
import { queryClient } from "../../lib/query/client.ts";
import { tokenOptions } from "./tokenQuery.ts";
import { TokenBlock } from "./TokenBlock.tsx";

// The block's days are the chain's (UTC): today's transfers, the last transfer's day, the window the chart needs, as the block words them.
vi.mock("../../features/chat/index.ts", () => ({
  PersonLink: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
const REALM = "gno.land/r/demo/foo";
type Token = TokenAnswer["tokens"][number];
const token = (days: Token["days"], last: Token["last"]): Token => ({
  symbol: "FOO",
  name: "Foo",
  decimals: 0,
  ambiguous: false,
  supply: null,
  holders: null,
  top: [],
  days,
  last,
});
function drawn(tokens: Token[]) {
  queryClient.setQueryData(tokenOptions(REALM).queryKey, { height: 1_234_567, tokens });
  return mount(createElement(MemoryRouter, null, createElement(TokenBlock, { realm: REALM })));
}

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse("2026-10-03T23:30:00.000Z"), toFake: ["Date"] });
  noMedia();
  noObservers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("a token's days, the chain's", () => {
  it("counts today's transfers by the UTC day, and words the last transfer's day and block as today", () => {
    const box = drawn([token([{ day: "2026-10-03", transfers: 5 }], { day: "2026-10-01", height: 99 })]);
    const today = [...box.querySelectorAll("section > div > div")].find((cell) =>
      cell.textContent.includes("Transfers today"),
    );
    expect(today?.querySelector(".visually-hidden")?.textContent).toBe("5");
    expect(today?.textContent).toContain("last on 1 Oct");
    expect(box.textContent).toContain("Last transfer 1 Oct, block 99.");
    expect(box.textContent).toContain("Replayed from the chain's token events, as of block 1234567.");
  });

  it("draws the chart once three days of the last thirty held a transfer, and not for days before them", () => {
    const three = ["2026-09-04", "2026-09-20", "2026-10-03"].map((day) => ({ day, transfers: 1 }));
    expect(drawn([token(three, { day: "2026-10-03", height: 7 })]).textContent).toContain("Transfers per day");
    queryClient.clear();
    const old = ["2026-09-01", "2026-09-02", "2026-09-03"].map((day) => ({ day, transfers: 1 }));
    expect(drawn([token(old, { day: "2026-09-03", height: 7 })]).textContent).not.toContain("Transfers per day");
  });
});
