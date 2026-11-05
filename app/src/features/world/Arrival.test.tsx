// @vitest-environment jsdom
import { Address, type Signal } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { Arrival, FirstCharted } from "./Arrival.tsx";
import { standInPopovers } from "../../../tests/popover.ts";

// Slice 9h (frames 90 to 97): the arrival banners, the design system's flash in its arrival look, one at a time, shown to the
// account the server's signal names and only from it: never the chart call's answer, a page load, a guest or another account.
// Their code loads only for a banner to show (budgets.spec.ts); a banner ends a day after its signal's time (D213).
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const AT = "2026-11-05T12:00:00.000Z";
const signal = (kind: Signal["kind"], account = ME): Signal => ({
  kind,
  world: "fresh-mint",
  account: Address.parse(account),
  at: AT,
});

let root: Root | undefined;
let host: HTMLElement | undefined;
// The banners' chunk and the copy are promises: a few turns let each settle.
const flush = async () => {
  for (let turn = 0; turn < 5; turn += 1)
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
  };
  const page = (world: string) => (
    <StoreProvider>
      <Grab />
      <Arrival world={world} name={name} address={ADDRESS} api={api as never} now={() => clock.now} />
    </StoreProvider>
  );
  const draw = async (world = "fresh-mint") => {
    act(() => {
      root?.render(page(world));
    });
    await flush();
  };
  // A signal as the page's one stream hands it to the store.
  const hear = async (heard: Signal) => {
    act(() => {
      state().signalActions.signaled(heard);
    });
    await flush();
  };
  return { api, calls, clock, draw, hear };
}
const signIn = async (who: string) => {
  act(() => {
    state().loginActions.signedIn(Address.parse(who));
  });
  await flush();
};
const text = () => host?.textContent ?? "";
const buttons = () => [...(host?.querySelectorAll("button") ?? [])].map((button) => button.textContent);
const press = async (name: string) => {
  const button = [...(host?.querySelectorAll("button") ?? [])].find(
    (found) => found.textContent === name || found.getAttribute("aria-label") === name,
  );
  act(() => button?.click());
  await flush();
};
const arrive = async (page: { draw: () => Promise<void> }) => {
  await page.draw();
  await signIn(ME);
};

// The first signals' chunk, loaded once ahead: the page waits for the network, a test only for React.
beforeAll(async () => {
  await Promise.all([import("./Banners.tsx"), import("./ChartedBy.tsx")]);
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  standInPopovers();
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
    await guest.draw();
    expect(guest.api.chart).not.toHaveBeenCalled();
    await signIn(ME);
    expect(guest.calls).toEqual(["chart fresh-mint"]);
  });

  it("asks nothing else and opens no stream of its own: who is first comes on the chat's stream", async () => {
    const page = setup();
    const sources = vi.fn();
    const fetches = vi.fn();
    vi.stubGlobal("EventSource", sources);
    vi.stubGlobal("fetch", fetches);
    await arrive(page);
    expect(page.calls).toEqual(["chart fresh-mint"]);
    expect(sources).not.toHaveBeenCalled();
    expect(fetches).not.toHaveBeenCalled();
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
    expect(page.calls).toEqual(["chart fresh-mint"]);
    expect(text()).toBe("");
    // A signal that names the earner still shows its banner: the signal is the only thing that does.
    await page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
  });

  it("charts the next world once the page moves to it, and shows nothing of the one it left", async () => {
    const page = setup();
    await arrive(page);
    await page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
    await page.draw("govdao");
    expect(page.calls).toEqual(["chart fresh-mint", "chart govdao"]);
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
    await page.draw();
    await page.hear(signal("chart"));
    expect(text()).toBe("");
  });

  it("shows nothing to an account that did not earn it", async () => {
    const page = setup();
    await page.draw();
    await signIn(OTHER);
    await page.hear(signal("chart", ME));
    expect(text()).toBe("");
  });

  it("shows nothing for another world's signal, even to the one who earned it", async () => {
    const page = setup();
    await arrive(page);
    await page.hear({ ...signal("chart"), world: "govdao" });
    await page.hear({ ...signal("words"), world: "govdao" });
    expect(text()).toBe("");
  });

  it("shows First to chart to the earner, as the frames word it, with Share and the flash's Close", async () => {
    const page = setup();
    await arrive(page);
    await page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
    expect(text().toLowerCase()).toContain("your name stays on it");
    expect(text()).not.toContain("First words");
    expect(buttons()).toEqual(["Share", ""]);
    expect(host?.querySelector("[aria-label='Close']")).not.toBeNull();
    expect(host?.querySelector("[data-look='arrival']")).not.toBeNull();
  });

  it("shows First words to the earner with its day", async () => {
    const page = setup();
    await arrive(page);
    await page.hear(signal("words"));
    expect(text()).toContain("First words in Fresh Mint");
    expect(text().toLowerCase()).toContain("your name shows on its label for a day");
  });

  // DESIGN-SYSTEM.md, Flash: one at a time, the next waits.
  it("shows one banner at a time: First words waits until First to chart is closed", async () => {
    const page = setup();
    await arrive(page);
    await page.hear(signal("chart"));
    await page.hear(signal("words"));
    expect(text()).toContain("First to chart · Fresh Mint");
    expect(text()).not.toContain("First words");
    await press("Close");
    expect(text()).toContain("First words in Fresh Mint");
    expect(text()).not.toContain("First to chart");
    await press("Close");
    expect(text()).toBe("");
  });

  // D213: a banner is the arrival's, not the page's: it ends a day after the signal's time, whether the stream gave it
  // live or replayed it, so a reload a week later shows none.
  it("shows a banner while its signal is under a day old, and none once it is a day old or more", async () => {
    const page = setup();
    await arrive(page);
    await page.hear(signal("words"));
    page.clock.now = Date.parse(AT) + DAY - 1;
    await page.draw();
    expect(text()).toContain("First words in Fresh Mint");
    page.clock.now = Date.parse(AT) + DAY;
    await page.draw();
    expect(text()).toBe("");
  });

  it("shows none for a signal replayed a week late, to the earner on a quiet world", async () => {
    const page = setup({ at: Date.parse(AT) + 7 * DAY });
    await arrive(page);
    await page.hear(signal("chart"));
    expect(text()).toBe("");
  });

  it("shares as the world's Share does: copies the page's address and says Copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const page = setup();
    await arrive(page);
    await page.hear(signal("chart"));
    await press("Share");
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(text()).toContain("Copied");
    expect(text()).not.toContain("First to chart");
  });

  it("says the copy was refused in words, never that it was copied", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) } });
    const page = setup();
    await arrive(page);
    await page.hear(signal("chart"));
    await press("Share");
    expect(text()).toContain("Could not copy the address");
    expect(text()).not.toContain("Copied");
  });

  it("draws no Share where the browser cannot copy", async () => {
    vi.stubGlobal("navigator", {});
    const page = setup();
    await arrive(page);
    await page.hear(signal("chart"));
    expect(text()).toContain("First to chart · Fresh Mint");
    expect(buttons()).not.toContain("Share");
  });

  it("draws a hostile world's name as text, never as markup", async () => {
    const page = setup({ name: '<img src=x onerror="alert(1)"><b>x</b>' });
    await arrive(page);
    await page.hear(signal("chart"));
    expect(host?.querySelector("img")).toBeNull();
    expect(host?.querySelector("b")).toBeNull();
    expect(text()).toContain('First to chart · <img src=x onerror="alert(1)"><b>x</b>');
  });

  it("is one element for the page to mount, which draws nothing at all without a banner to show", async () => {
    const page = setup();
    await arrive(page);
    expect(host?.children).toHaveLength(0);
    await page.hear(signal("chart"));
    expect(host?.children).toHaveLength(1);
  });
});

// Frame 91's plate: "First charted by @name", for every reader, from the stream's signals alone; plain text, and nothing until
// the server has said who.
describe("First charted by", () => {
  const charted = (world: string): Signal => ({ ...signal("chart"), world });
  const plate = async () => {
    act(() => {
      root?.render(
        <StoreProvider>
          <Grab />
          <FirstCharted world="fresh-mint" />
        </StoreProvider>,
      );
    });
    await flush();
  };
  const told = async (heard: Signal) => {
    act(() => {
      state().signalActions.signaled(heard);
    });
    await flush();
  };

  it("draws nothing until the server has said who charted the world, and never a guess", async () => {
    await plate();
    expect(text()).toBe("");
  });

  it("names the account that charted it, by its short address, as plain text", async () => {
    await plate();
    await told(charted("fresh-mint"));
    expect(text()).toBe("First charted by @g1jg8m…vsqf5");
    expect(host?.querySelector("a, button, img")).toBeNull();
  });

  it("names it from a signal of the stream too, and not for another world's", async () => {
    await plate();
    await told(charted("govdao"));
    expect(text()).toBe("");
    await told(charted("fresh-mint"));
    expect(text()).toBe("First charted by @g1jg8m…vsqf5");
  });

  it("says nothing of a world whose first words alone are known", async () => {
    await plate();
    await told(signal("words"));
    expect(text()).toBe("");
  });
});
