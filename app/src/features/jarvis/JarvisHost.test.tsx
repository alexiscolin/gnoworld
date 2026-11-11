// @vitest-environment jsdom
import type { JarvisAnswer } from "@gnoworld/schemas";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { tellJarvisHere, useJarvisItems, type JarvisHere } from "../../jarvisHere.ts";
import { askFor } from "../../pageAsks.ts";
import { StoreProvider } from "../../storeContext.tsx";
import { all, button, drawer, modals, one, settled } from "../../../tests/mount.tsx";
import { JarvisSlot } from "../chat/jarvisEntries.tsx";
import { JarvisListener } from "./JarvisListener.tsx";

// 10u-a: the page's asks "jarvis" and "jarvis-catch-up" add Jarvis's cards for the room the chat told, to the account that asked.
const ME = "g1me";
const place = (room: string, account: string | undefined): JarvisHere => ({
  room,
  universe: { id: "onyx", isDefault: true },
  account,
});
const answered = (markdown: string): JarvisAnswer => ({ status: "answered", markdown, buttons: [] });

// The fetch the page's Jarvis client calls: each ask waits for its answer, by the room it names.
const held = new Map<string, (answer: JarvisAnswer) => void>();
const bodies: unknown[] = [];
beforeAll(() => {
  modals();
  vi.stubGlobal("reportError", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { room: string };
      bodies.push(body);
      return new Promise<Response>((resolve) => {
        held.set(body.room, (answer) => {
          resolve(new Response(JSON.stringify(answer), { status: 200 }));
        });
      });
    }),
  );
});
afterEach(() => {
  held.clear();
  bodies.length = 0;
  act(() => {
    tellJarvisHere(undefined);
  });
});

function Cards({ room, account }: { room: string; account: string | undefined }) {
  return (
    <ol>
      {useJarvisItems(room, account).map((item) => (
        <JarvisSlot key={item.id} item={item} />
      ))}
    </ol>
  );
}
function page(rooms: [string, string | undefined][]) {
  const show = drawer();
  show(
    <MemoryRouter>
      <StoreProvider>
        <JarvisListener />
        {rooms.map(([room, account]) => (
          <div key={`${room} ${String(account)}`} data-test={`${room} ${String(account)}`}>
            <Cards room={room} account={account} />
          </div>
        ))}
      </StoreProvider>
    </MemoryRouter>,
  );
  return (room: string, account: string | undefined) => one(document.body, `[data-test="${room} ${String(account)}"]`);
}
const tell = (here: JarvisHere | undefined) => {
  act(() => {
    tellJarvisHere(here);
  });
};
const ask = (what: "jarvis" | "jarvis-catch-up") => {
  act(() => {
    askFor(what);
  });
};

describe("Jarvis's host", () => {
  it("draws Jarvis's introduction in the room when the page asks Jarvis, once however many times it asks", async () => {
    const cards = page([["#a1", ME]]);
    tell(place("#a1", ME));
    ask("jarvis");
    await settled(() => button(cards("#a1", ME), "What can I do here?") !== undefined);
    ask("jarvis");
    await act(() => Promise.resolve());
    expect(all(cards("#a1", ME), "li")).toHaveLength(1);
  });

  it("listens to nothing while no room is told: Jarvis is off, or the chat in view is a direct message", async () => {
    const cards = page([["#a2", ME]]);
    ask("jarvis");
    ask("jarvis-catch-up");
    await act(() => Promise.resolve());
    expect(all(cards("#a2", ME), "li")).toEqual([]);
    expect(bodies).toEqual([]);
  });

  it("sends the catch-up ask at once on Catch up, and draws the answer as a card", async () => {
    const cards = page([["#a3", ME]]);
    tell(place("#a3", ME));
    ask("jarvis-catch-up");
    await settled(() => bodies.length === 1);
    expect(bodies).toEqual([{ ask: "catch-up", room: "#a3" }]);
    expect(cards("#a3", ME).textContent).toContain("reading");
    act(() => held.get("#a3")?.(answered("Nothing new.")));
    await settled(() => cards("#a3", ME).textContent.includes("Nothing new."));
  });

  it("holds one ask in flight an account in a room: a second Catch up waits for the first", async () => {
    page([["#a4", ME]]);
    tell(place("#a4", ME));
    ask("jarvis-catch-up");
    await settled(() => bodies.length === 1);
    ask("jarvis-catch-up");
    await act(() => Promise.resolve());
    expect(bodies).toHaveLength(1);
  });

  it("gives an answer to the room it was asked in: a late answer for room A never takes room B's pending ask", async () => {
    const cards = page([
      ["#a5", ME],
      ["#b5", ME],
    ]);
    tell(place("#a5", ME));
    ask("jarvis-catch-up");
    await settled(() => bodies.length === 1);
    tell(place("#b5", ME));
    ask("jarvis-catch-up");
    await settled(() => bodies.length === 2);
    act(() => held.get("#a5")?.(answered("About A.")));
    await settled(() => cards("#a5", ME).textContent.includes("About A."));
    expect(cards("#b5", ME).textContent).toContain("reading");
    expect(cards("#b5", ME).textContent).not.toContain("About A.");
    act(() => held.get("#b5")?.(answered("About B.")));
    await settled(() => cards("#b5", ME).textContent.includes("About B."));
  });

  it("keeps an account's cards from the next account in the same tab: its answer, its ask in flight and its introduction", async () => {
    const cards = page([
      ["#a6", ME],
      ["#a6", "g1you"],
    ]);
    tell(place("#a6", ME));
    ask("jarvis-catch-up");
    await settled(() => bodies.length === 1);
    tell(place("#a6", "g1you"));
    ask("jarvis");
    await settled(
      () =>
        cards("#a6", "g1you").textContent.includes("Connect") ||
        button(cards("#a6", "g1you"), "What can I do here?") !== undefined,
    );
    act(() => held.get("#a6")?.(answered("For the first account.")));
    await settled(() => cards("#a6", ME).textContent.includes("For the first account."));
    expect(cards("#a6", "g1you").textContent).not.toContain("For the first account.");
    expect(cards("#a6", "g1you").textContent).not.toContain("reading");
  });

  it("asks a guest to connect Adena in its introduction", async () => {
    const cards = page([["#a7", undefined]]);
    tell(place("#a7", undefined));
    ask("jarvis");
    await settled(() => cards("#a7", undefined).textContent.includes("Connect Adena to ask Jarvis"));
    expect(cards("#a7", undefined).textContent).toContain("Connect Adena to ask Jarvis");
  });
});
