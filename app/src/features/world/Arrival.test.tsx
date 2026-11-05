// @vitest-environment jsdom
import { Address, type Signal, type WorldFirsts } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { Arrival } from "./Arrival.tsx";

// Slice 9h (frames 90 to 97): the two arrival banners, shown to the person who earned them and only from the server's signal,
// never from the chart call's answer, a page load, a guest or another account. The signals reach the store on the chat's one
// stream (D215), so <Arrival> opens none; a banner ends a day after its signal's time (D213), by the clock it is given.
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const AT = "2026-11-05T12:00:00.000Z";
const signal = (kind: Signal["kind"], account = ME): Signal => ({
  kind,
  world: "fresh-mint",
  account: Address.parse(account),
  at: AT,
});
const NOBODY: Result<WorldFirsts> = { ok: true, value: { world: "fresh-mint", charted: null, words: null } };

let root: Root | undefined;
let host: HTMLElement | undefined;
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const DAY = 24 * 60 * 60_000;
const ADDRESS = "https://gno.world/net/onyx/w/fresh-mint";

// A fake page: the calls it made, and the time it says it is (just after the signals).
function setup({
  chart = { ok: true, value: { world: "fresh-mint", first: true } },
  name = "Fresh Mint",
  at = Date.parse(AT) + 1000,
}: { chart?: Result<unknown>; name?: string; at?: number } = {}) {
  const calls: string[] = [];
  const clock = { now: at };
  const api = {
    chart: vi.fn((world: string) => {
      calls.push(`chart ${world}`);
      return Promise.resolve(chart);
    }),
    firsts: vi.fn((world: string) => {
      calls.push(`firsts ${world}`);
      return Promise.resolve(NOBODY);
    }),
  };
  const page = (world: string) => (
    <StoreProvider>
      <Grab />
      <Arrival world={world} name={name} address={ADDRESS} api={api as never} now={() => clock.now} />
    </StoreProvider>
  );
  const draw = (world = "fresh-mint") => {
    act(() => {
      root?.render(page(world));
    });
  };
  // A signal as the page's one stream hands it to the store.
  const hear = (heard: Signal) => {
    act(() => {
      state().signalActions.signaled(heard);
    });
  };
  return { api, calls, clock, draw, hear };
}
const signIn = (who: string) => {
  act(() => {
    state().loginActions.signedIn(Address.parse(who));
  });
};
const text = () => host?.textContent ?? "";
const arrive = async (page: { draw: () => void }) => {
  page.draw();
  signIn(ME);
  await flush();
};

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media }));
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  vi.unstubAllGlobals();
  host?.remove();
});

describe("charting on arrival", () => {
  it("asks the server to chart the world once the person is logged in, and never as a guest", async () => {
    const guest = setup();
    guest.draw();
    await flush();
    expect(guest.api.chart).not.toHaveBeenCalled();
    signIn(ME);
    await flush();
    expect(guest.calls.filter((call) => call.startsWith("chart"))).toEqual(["chart fresh-mint"]);
  });

  it("reads who is first for anyone, and opens no stream of its own", async () => {
    const page = setup();
    const sources = vi.fn();
    vi.stubGlobal("EventSource", sources);
    page.draw();
    await flush();
    expect(page.calls).toContain("firsts fresh-mint");
    expect(sources).not.toHaveBeenCalled();
  });

  // Every logged-in visit to a world calls it, and each call counts against the account's 20 an hour (D211): a refusal is
  // routine, and the page takes it quietly, asking once and never again against the rate.
  it.each([
    ["too many", { ok: false, reason: "too_many" }],
    ["unauthenticated", { ok: false, reason: "unauthenticated" }],
    ["not found", { ok: false, reason: "not_found" }],
    ["a network failure", { ok: false, reason: "network" }],
    ["a malformed answer", { ok: false, reason: "malformed" }],
  ] as const)("leaves the page empty and asks once when the chart call fails with %s", async (_, refusal) => {
    const page = setup({ chart: refusal });
    await arrive(page);
    await flush();
    expect(page.calls.filter((call) => call.startsWith("chart"))).toEqual(["chart fresh-mint"]);
    expect(text()).toBe("");
    // A signal that names the earner still shows its banner: the signal is the only thing that does.
    page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
  });

  it("charts the next world once the page moves to it, and shows nothing of the one it left", async () => {
    const page = setup();
    await arrive(page);
    page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
    page.draw("govdao");
    await flush();
    expect(page.calls.filter((call) => call.startsWith("chart"))).toEqual(["chart fresh-mint", "chart govdao"]);
    expect(page.calls).toContain("firsts govdao");
    expect(text()).toBe("");
  });
});

describe("the banners", () => {
  it("shows nothing before a signal, even when the chart call answered first: never optimistic", async () => {
    const page = setup();
    await arrive(page);
    expect(page.api.chart).toHaveBeenCalled();
    expect(text()).toBe("");
  });

  it("shows nothing for a guest, even for a signal that names an account", async () => {
    const page = setup();
    page.draw();
    await flush();
    page.hear(signal("chart"));
    expect(text()).toBe("");
  });

  it("shows nothing to an account that did not earn it", async () => {
    const page = setup();
    page.draw();
    signIn(OTHER);
    await flush();
    page.hear(signal("chart", ME));
    expect(text()).toBe("");
  });

  it("shows nothing for another world's signal, even to the one who earned it", async () => {
    const page = setup();
    await arrive(page);
    page.hear({ ...signal("chart"), world: "govdao" });
    page.hear({ ...signal("words"), world: "govdao" });
    expect(text()).toBe("");
  });

  it("shows First to chart to the earner, as the frames word it, with Share", async () => {
    const page = setup();
    await arrive(page);
    page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
    expect(text().toLowerCase()).toContain("your name stays on it");
    expect(text()).not.toContain("First words");
    expect([...(host?.querySelectorAll("button") ?? [])].map((button) => button.textContent)).toEqual(["Share"]);
  });

  it("shows First words to the earner with its day, and both banners when the person earned both", async () => {
    const page = setup();
    await arrive(page);
    page.hear(signal("words"));
    expect(text()).toContain("First words in Fresh Mint");
    expect(text().toLowerCase()).toContain("your name shows on its label for a day");
    page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
    expect(text()).toContain("First words in Fresh Mint");
  });

  // D213: a banner is the arrival's, not the page's: it ends a day after the signal's time, whether the stream gave it
  // live or replayed it (its ring keeps it until a restart), so a reload a week later shows none.
  it("shows a banner while its signal is under a day old, and none once it is a day old or more", async () => {
    const page = setup();
    await arrive(page);
    page.hear(signal("chart"));
    page.hear(signal("words"));
    page.clock.now = Date.parse(AT) + DAY - 1;
    page.draw();
    expect(text()).toContain("First to chart · Fresh Mint");
    expect(text()).toContain("First words in Fresh Mint");
    page.clock.now = Date.parse(AT) + DAY;
    page.draw();
    expect(text()).toBe("");
  });

  it("shows none for a signal replayed a week late, to the earner on a quiet world", async () => {
    const page = setup({ at: Date.parse(AT) + 7 * DAY });
    await arrive(page);
    page.hear(signal("chart"));
    expect(text()).toBe("");
  });

  it("shares as the world's Share does: copies the page's address and says Copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const page = setup();
    await arrive(page);
    page.hear(signal("chart"));
    const share = host?.querySelector("button");
    act(() => share?.click());
    await flush();
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(host?.querySelector("[role='status']")?.textContent).toContain("Copied");
  });

  it("says the copy was refused in words, never that it was copied", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) } });
    const page = setup();
    await arrive(page);
    page.hear(signal("chart"));
    act(() => host?.querySelector("button")?.click());
    await flush();
    expect(host?.querySelector("[role='status']")?.textContent).toBe("Could not copy the address");
    expect(text()).not.toContain("Copied");
  });

  it("draws no Share where the browser cannot copy", async () => {
    vi.stubGlobal("navigator", {});
    const page = setup();
    await arrive(page);
    page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
    expect(host?.querySelectorAll("button")).toHaveLength(0);
  });

  it("draws a hostile world's name as text, never as markup", async () => {
    const page = setup({ name: '<img src=x onerror="alert(1)"><b>x</b>' });
    await arrive(page);
    page.hear(signal("chart"));
    expect(host?.querySelector("img")).toBeNull();
    expect(host?.querySelector("b")).toBeNull();
    expect(text()).toContain('First to chart · <img src=x onerror="alert(1)"><b>x</b>');
  });

  it("is one element for the page to mount: nothing at all when it shows nothing, one child when it shows both", async () => {
    const page = setup();
    page.draw();
    await flush();
    expect(host?.children).toHaveLength(0);
    signIn(ME);
    await flush();
    page.hear(signal("chart"));
    page.hear(signal("words"));
    expect(host?.children).toHaveLength(1);
  });
});
