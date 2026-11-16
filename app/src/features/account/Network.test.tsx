// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { PillHost } from "../../topPill.tsx";
import { Network } from "./Network.tsx";

// The network named right of the login button is a menu of the networks (D13501): Onyx and gno.land, the current one checked, "Testnet" kept
// on Onyx; choosing one keeps the place when that network's chain holds it, else goes to its home and says so. The chain's read is faked.
const chain = vi.hoisted(() => ({
  readPage: vi.fn<(rpc: string, source: unknown, options: { signal?: AbortSignal }) => Promise<unknown>>(),
}));
vi.mock("../../lib/chain/rpc.ts", async (original) => ({
  ...(await original<object>()),
  readPage: chain.readPage,
}));

const found = { ok: true, value: "# dao", source: { rpc: "x", chainId: null } };
const missing = { ok: false, failure: { kind: "no-realm", next: "" }, source: { rpc: "x", chainId: null } };

beforeAll(() => {
  Object.assign(HTMLElement.prototype, { showPopover: () => undefined, hidePopover: () => undefined });
  vi.stubGlobal("reportError", vi.fn());
});
beforeEach(() => {
  chain.readPage.mockReset();
});

const Where = () => <output data-at="">{useLocation().pathname}</output>;
const Go = () => {
  const navigate = useNavigate();
  return (
    <i
      data-go=""
      onClick={() => {
        Promise.resolve(navigate("/w/bubble")).catch(reportError);
      }}
    />
  );
};
const at = () => document.querySelector("[data-at]")?.textContent;
const calling = <T extends Element>(find: () => T | null | undefined) => {
  const one = find();
  if (!one) throw new Error("not drawn");
  return one;
};
const trigger = (box: HTMLElement) => calling(() => box.querySelector<HTMLButtonElement>("button"));
const radios = () => [...document.querySelectorAll<HTMLElement>("[role='menuitemradio']")];
const radio = (name: string) => calling(() => radios().find((each) => each.textContent.startsWith(name)));

// The menu's code comes at the first press of the name, and opens in its place.
async function draw(path: string, inPill = false) {
  const box = mount(
    <MemoryRouter initialEntries={[path]}>
      <Network
        name={path.startsWith("/net/gnoland") ? "gno.land" : "Onyx"}
        testnet={!path.startsWith("/net/gnoland")}
        inPill={inPill}
      />
      <Where />
      <Go />
      <PillHost />
    </MemoryRouter>,
  );
  act(() => {
    trigger(box).click();
  });
  await settled(() => radios().length > 0);
  return box;
}
const choose = async (name: string) => {
  act(() => {
    radio(name).click();
  });
  await settled(() => true);
};

describe("the network control", () => {
  it.each([false, true])(
    "lists both networks with the current one checked, Testnet kept on Onyx (in a pill: %s)",
    async (inPill) => {
      const box = await draw("/w/bubble", inPill);
      expect(trigger(box).getAttribute("aria-haspopup")).toBe("menu");
      expect(radios().map((each) => each.textContent)).toEqual([expect.stringContaining("Onyx"), "gno.land"]);
      expect(radio("Onyx").textContent).toContain("Testnet");
      expect(radio("Onyx").getAttribute("aria-checked")).toBe("true");
      expect(radio("gno.land").getAttribute("aria-checked")).toBe("false");
    },
  );

  it("checks gno.land when one is on it", async () => {
    await draw("/net/gnoland");
    expect(radio("gno.land").getAttribute("aria-checked")).toBe("true");
    expect(radio("Onyx").getAttribute("aria-checked")).toBe("false");
  });

  it("goes to the realm's /net/gnoland page when gno.land's chain holds it, asking that chain", async () => {
    chain.readPage.mockResolvedValue(found);
    await draw("/r/gov/dao");
    await choose("gno.land");
    await settled(() => at() === "/net/gnoland/r/gov/dao");
    expect(chain.readPage).toHaveBeenCalledTimes(1);
    expect(chain.readPage.mock.calls[0]?.[0]).toBe("https://rpc.gno.land:443");
    expect(document.body.textContent).not.toMatch(/not on gno\.land/i);
  });

  it("lets a read that settles late change nothing once the reader has gone elsewhere", async () => {
    let settle: (value: typeof found) => void = () => undefined;
    chain.readPage.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    await draw("/r/gov/dao");
    await choose("gno.land");
    act(() => {
      document.querySelector<HTMLElement>("[data-go]")?.click();
    });
    await settled(() => at() === "/w/bubble");
    settle(found);
    await settled(() => true);
    expect(at()).toBe("/w/bubble");
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(document.body.textContent).not.toMatch(/not on gno\.land/i);
    expect(chain.readPage.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  });

  it("lets a second choice end the first: the first read changes nothing and the work stays shown until the second settles", async () => {
    const pending: ((value: typeof found) => void)[] = [];
    chain.readPage.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const box = await draw("/r/gov/dao");
    await choose("gno.land");
    act(() => {
      trigger(box).click();
    });
    await settled(() => radios().length > 0);
    await choose("gno.land");
    expect(chain.readPage).toHaveBeenCalledTimes(2);
    pending[0]?.(found);
    await settled(() => true);
    expect(at()).toBe("/r/gov/dao");
    expect(chain.readPage.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    expect(trigger(box).getAttribute("aria-busy")).toBe("true");
    pending[1]?.(found);
    await settled(() => at() === "/net/gnoland/r/gov/dao");
    expect(trigger(box).getAttribute("aria-busy")).not.toBe("true");
  });

  it("keeps a realm the other chain holds but draws no page for (no Render): the chain says it exists", async () => {
    chain.readPage.mockResolvedValue({ ok: false, failure: { kind: "no-page", next: "" }, source: missing.source });
    await draw("/r/gov/dao");
    await choose("gno.land");
    await settled(() => at() === "/net/gnoland/r/gov/dao");
    expect(document.body.textContent).not.toMatch(/not on gno\.land/i);
  });

  it("keeps a realm the target's worlds list, with no chain asked", async () => {
    chain.readPage.mockRejectedValue(new Error("down"));
    await draw("/net/gnoland/r/gov/dao");
    await choose("Onyx");
    await settled(() => at() === "/r/gov/dao");
    expect(chain.readPage).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/not on Onyx/i);
  });

  it("shows the work on the trigger, which stays in view when the menu closes, while the chain is read", async () => {
    chain.readPage.mockReturnValue(new Promise(() => undefined));
    const hide = vi.spyOn(HTMLElement.prototype, "hidePopover").mockImplementation(function (this: HTMLElement) {
      this.hidden = true;
    });
    const box = await draw("/r/gov/dao");
    await choose("gno.land");
    hide.mockRestore();
    expect(document.querySelector<HTMLElement>("[role='menu']")?.hidden).toBe(true);
    expect(trigger(box).getAttribute("aria-busy")).toBe("true");
    expect(trigger(box).querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(at()).toBe("/r/gov/dao");
  });

  it.each([
    ["the chain has no such realm", () => chain.readPage.mockResolvedValue(missing)],
    ["the read fails", () => chain.readPage.mockRejectedValue(new Error("down"))],
  ])("goes to /net/gnoland with a line when %s", async (_, answer) => {
    answer();
    await draw("/r/gov/dao");
    await choose("gno.land");
    await settled(() => at() === "/net/gnoland");
    await settled(() => /not on gno\.land/i.test(document.body.textContent));
    expect(at()).toBe("/net/gnoland");
  });

  it("keeps a world gno.land does not list out: home and the line, no chain asked", async () => {
    await draw("/w/bubble");
    await choose("gno.land");
    await settled(() => at() === "/net/gnoland");
    expect(document.body.textContent).toMatch(/not on gno\.land/i);
    expect(chain.readPage).not.toHaveBeenCalled();
  });

  it("goes back to Onyx's home as / from a gno.land page Onyx does not hold", async () => {
    await draw("/net/gnoland/w/x");
    await choose("Onyx");
    await settled(() => at() === "/");
    expect(document.body.textContent).toMatch(/not on Onyx/i);
  });

  it("goes to the Earth of the other network from this one", async () => {
    await draw("/earth");
    await choose("gno.land");
    await settled(() => at() === "/net/gnoland/earth");
    expect(at()).toBe("/net/gnoland/earth");
  });
});
