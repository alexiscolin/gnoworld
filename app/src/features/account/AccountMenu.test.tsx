// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { MemoryRouter } from "react-router";
import { Network } from "./Network.tsx";
import { Opened } from "./Opened.tsx";

// Frames 6 and 17: the header's right end is one pill; logged in, the account's face and its address open the menu, which holds the
// way out.
const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const items = (box: HTMLElement) => [...box.querySelectorAll("[role='menuitem']")].map((item) => item.textContent);

vi.mock("react-router", async (original) => ({
  ...(await original<object>()),
  useLocation: () => ({ hash: "", pathname: "/", search: "" }),
  useNavigate: () => () => undefined,
}));

// jsdom has no popover API, which the menu opens at once with: the page's own journeys see it.
beforeAll(() => {
  Object.assign(HTMLElement.prototype, { showPopover: () => undefined, hidePopover: () => undefined });
  vi.stubGlobal("reportError", vi.fn());
});

describe("the account's menu", () => {
  it("ends with Log out for an account, which logs out once", () => {
    const onLogOut = vi.fn();
    const box = mount(<Opened address={ADDRESS} lead={null} onLogOut={onLogOut} />);
    expect(items(box)).toEqual(["JarvisSoon", "Passport", "Saved", "Settings", "Log out"]);
    const out = [...box.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].at(-1);
    act(() => {
      out?.click();
    });
    expect(onLogOut).toHaveBeenCalledTimes(1);
  });

  it("says why Jarvis is greyed when it is on but no room is in view, and coming soon when it is off", () => {
    const off = mount(<Opened address={ADDRESS} lead={null} onLogOut={() => undefined} />);
    expect(off.querySelector("[role='menuitem']")?.getAttribute("aria-label")).toBe("Jarvis, coming soon");
    const on = mount(
      <Opened address={ADDRESS} lead={null} onLogOut={() => undefined} jarvisWhy="Open a room to ask Jarvis" />,
    );
    expect(on.querySelector("[role='menuitem']")?.getAttribute("aria-label")).toBe("Jarvis, Open a room to ask Jarvis");
  });

  it("on a phone keeps the order note, Connect, Passport, Settings, networks, Release a key, with no greyed Jarvis", () => {
    const box = mount(
      <Opened address={undefined} lead={null} onLogOut={() => undefined} onConnect={() => undefined} phone />,
    );
    const rows = [...box.querySelectorAll("[role^='menuitem']")].map((item) => item.textContent);
    expect(rows.slice(0, 3)).toEqual(["Connect Adena", "Passport", "Settings"]);
    expect(rows.at(-1)).toBe("Release a key");
    expect(rows.filter((row) => row.startsWith("Network:")).length).toBeGreaterThan(0);
    expect(rows.some((row) => row.startsWith("Jarvis"))).toBe(false);
    expect(rows.findIndex((row) => row.startsWith("Network:"))).toBeGreaterThan(rows.indexOf("Settings"));
  });

  it("on a phone has a Credits row after Settings, which opens the credits dialog; a computer's menu has none", async () => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.open = true;
      },
      close(this: HTMLDialogElement) {
        this.open = false;
      },
    });
    const computer = mount(<Opened address={undefined} lead={null} onLogOut={() => undefined} />);
    expect(items(computer)).not.toContain("Credits");
    const box = mount(<Opened address={ADDRESS} lead={null} onLogOut={() => undefined} phone />);
    const rows = items(box);
    expect(rows.indexOf("Credits")).toBe(rows.indexOf("Settings") + 1);
    expect(box.querySelector("dialog")).toBeNull();
    const row = [...box.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].find(
      (item) => item.textContent === "Credits",
    );
    act(() => {
      row?.click();
    });
    await vi.waitFor(() => {
      expect(box.querySelector("dialog[open]")?.textContent).toContain("Credits");
    });
  });

  it("offers no way out to a guest, whose menu is the device's", () => {
    const box = mount(<Opened address={undefined} lead={null} onLogOut={() => undefined} />);
    expect(items(box)).toEqual(["JarvisSoon", "Passport", "Settings", "Release a key"]);
  });

  it("draws the note it is given atop a guest's menu, outside its items, and none otherwise", () => {
    const guest = mount(
      <Opened address={undefined} lead={null} onLogOut={() => undefined} guestNote="Use a computer." />,
    );
    expect(guest.querySelector("[role='menu']")?.firstElementChild?.textContent).toBe("Use a computer.");
    expect(items(guest)).not.toContain("Use a computer.");
    const none = mount(<Opened address={undefined} lead={null} onLogOut={() => undefined} />);
    expect(none.querySelector("[role='menu']")?.textContent).not.toContain("Use a computer.");
  });

  it("reads a guest's note as the menu's description, and says no description without one", () => {
    const guest = mount(
      <Opened address={undefined} lead={null} onLogOut={() => undefined} guestNote="Use a computer." />,
    );
    const menu = guest.querySelector("[role='menu']");
    expect(menu?.getAttribute("aria-describedby")).toBe(menu?.firstElementChild?.id);
    const none = mount(<Opened address={undefined} lead={null} onLogOut={() => undefined} />);
    expect(none.querySelector("[role='menu']")?.getAttribute("aria-describedby")).toBeNull();
  });

  it("gives an account no note, whatever a phone says: the note is for a guest", () => {
    const box = mount(<Opened address={ADDRESS} lead={null} onLogOut={() => undefined} guestNote="Use a computer." />);
    const menu = box.querySelector("[role='menu']");
    expect(menu?.textContent).not.toContain("Use a computer.");
    expect(menu?.getAttribute("aria-describedby")).toBeNull();
    expect(menu?.querySelector("p")).toBeNull();
  });

  it("on a phone tells a logged-in account whose it is, as the menu's note; a computer's pill says it already", () => {
    const phone = mount(<Opened address={ADDRESS} lead={null} onLogOut={() => undefined} phone />);
    const menu = phone.querySelector("[role='menu']");
    expect(menu?.firstElementChild?.textContent).toBe("Logged in as g1jg8m…vsqf5");
    expect(menu?.getAttribute("aria-describedby")).toBe(menu?.firstElementChild?.id);
    const computer = mount(<Opened address={ADDRESS} lead={null} onLogOut={() => undefined} />);
    expect(computer.querySelector("[role='menu']")?.querySelector("p")).toBeNull();
  });

  it("names its trigger the account and draws the lead it is given, the account's face and address", () => {
    const box = mount(<Opened address={ADDRESS} lead={<span data-face="" />} onLogOut={() => undefined} />);
    const trigger = box.querySelector("button:not([role='menuitem'])");
    expect(trigger?.textContent).toContain("Your account");
    expect(trigger?.querySelector("[data-face]")).not.toBeNull();
  });
});

// The header's account as the page mounts it (a case the red pass found): the session read once, the way in, the pill, the way out through the
// menu, and a refused logout said where the page says why a login stopped.
const api = vi.hoisted(() => ({
  me: vi.fn<() => Promise<unknown>>(),
  logout: vi.fn<() => Promise<unknown>>(),
  challenge: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("../../lib/api/login.ts", () => ({ pageLoginApi: () => api }));
const adena = vi.hoisted(() => ({ connect: vi.fn(() => Promise.resolve({ ok: false, reason: "missing" })) }));
vi.mock("../../lib/adena/adena.ts", () => ({ connect: adena.connect, pageAdena: () => undefined, signLogin: vi.fn() }));

const chain = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock("../../lib/chain/rpc.ts", async (original) => ({ ...(await original<object>()), readPage: chain.readPage }));

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1)
    await act(async () => {
      await Promise.resolve();
    });
};
const mountMenu = async () => {
  const { StoreProvider } = await import("../../storeContext.tsx");
  const { AccountMenu } = await import("./AccountMenu.tsx");
  const box = mount(
    <StoreProvider>
      <AccountMenu universe="onyx" />
    </StoreProvider>,
  );
  await settle();
  return box;
};
// Each wait a chunk asked lazily can take on a loaded machine: the menu's, Adena's.
const SOON = { timeout: 10_000 };
// The tests' own time, which holds several of those waits (Here.test.tsx's way).
const SLOW = { timeout: 60_000 };
const logOutItem = (box: HTMLElement) =>
  [...box.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].find((item) => item.textContent === "Log out");
// Opens the account's menu at its pill and picks Log out, as a reader does.
async function logOutThrough(box: HTMLElement) {
  act(() => {
    box.querySelector("button")?.click();
  });
  const item = await vi.waitFor(() => {
    const found = logOutItem(box);
    expect(found).toBeDefined();
    return found;
  }, SOON);
  act(() => {
    item?.click();
  });
  await settle();
}
// Each button's name: an icon's its label, a pill's its words.
const buttonsOf = (box: HTMLElement) =>
  [...box.querySelectorAll("button")].map((each) => each.getAttribute("aria-label") ?? each.textContent.trim());

describe("the header's account", SLOW, () => {
  it("logged out: one Connect beside the device's menu (D13881), the session read once, its Adena starting the login once", async () => {
    api.me.mockResolvedValue({ ok: true, value: { address: null } });
    adena.connect.mockClear();
    const box = await mountMenu();
    await vi.waitFor(() => {
      expect(buttonsOf(box)).toEqual(["Menu", "Connect"]);
    }, SOON);
    expect(api.me).toHaveBeenCalledTimes(1);
    act(() => {
      [...box.querySelectorAll("button")].find((each) => each.textContent === "Connect")?.click();
    });
    // Connect's menu: the burger's own component, two ways in.
    await vi.waitFor(() => {
      expect(items(box)).toEqual(["Adena", "gnokey"]);
    }, SOON);
    act(() => {
      [...box.querySelectorAll("button")].find((each) => each.textContent === "Adena")?.click();
    });
    await vi.waitFor(() => {
      expect(adena.connect).toHaveBeenCalledTimes(1);
    }, SOON);
    act(() => {
      box.querySelector<HTMLButtonElement>("button[aria-label='Menu']")?.click();
    });
    await vi.waitFor(() => {
      // The device's own menu, apart from Connect's, which stays in the page once drawn.
      expect(items(box.querySelector<HTMLElement>("[aria-label='Your device']") ?? box)).toEqual([
        "JarvisSoon",
        "Passport",
        "Settings",
        "Release a key",
      ]);
    }, SOON);
  });

  it("logged in: the pill shows the short address before the menu's code comes, and Log out in its menu ends the session", async () => {
    api.me.mockReset().mockResolvedValue({ ok: true, value: { address: ADDRESS } });
    api.logout.mockReset().mockResolvedValue({ ok: true, value: undefined });
    const box = await mountMenu();
    await vi.waitFor(() => {
      expect(box.querySelector("button")?.textContent).toContain("g1jg8m…vsqf5");
    }, SOON);
    const pill = box.querySelector("button");
    expect(pill?.textContent).toContain("Your account");
    await vi.waitFor(() => {
      expect(pill?.querySelector("[aria-hidden='true']")).not.toBeNull();
    }, SOON);
    expect(buttonsOf(box)).not.toContain("Connect");
    await logOutThrough(box);
    await vi.waitFor(() => {
      expect(buttonsOf(box)).toContain("Connect");
    }, SOON);
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it("says a refused logout in its status region, the account still in and its Log out offered again", async () => {
    api.me.mockReset().mockResolvedValue({ ok: true, value: { address: ADDRESS } });
    api.logout.mockReset().mockResolvedValue({ ok: false, reason: "network" });
    const box = await mountMenu();
    await vi.waitFor(() => {
      expect(box.querySelector("button")?.textContent).toContain("g1jg8m…vsqf5");
    }, SOON);
    await logOutThrough(box);
    await vi.waitFor(() => {
      expect(box.querySelector("[role='status']")?.textContent).toBe(
        "The server could not be reached. Check your connection, then try again.",
      );
    }, SOON);
    expect(box.querySelector("button")?.textContent).toContain("g1jg8m…vsqf5");
    expect(items(box)).toContain("Log out");
  });
});

// The network's control is drawn beside the login button and the account's pill, never inside them (a button in a button): pressing its name
// or choosing a network must not log in, nor open the account's menu.
describe.each([
  ["logged out", null],
  ["logged in", ADDRESS],
])("the network control, %s", SLOW, (_, address) => {
  it("is no descendant of another button, and choosing a network neither logs in nor opens the account's menu", async () => {
    api.me.mockReset().mockResolvedValue({ ok: true, value: { address } });
    adena.connect.mockClear();
    chain.readPage.mockResolvedValue({ ok: true, value: "# dao", source: { rpc: "x", chainId: null } });
    const { StoreProvider } = await import("../../storeContext.tsx");
    const { AccountMenu } = await import("./AccountMenu.tsx");
    const box = mount(
      <MemoryRouter>
        <StoreProvider>
          <AccountMenu universe="onyx" network={<Network name="Onyx" testnet inPill />} />
        </StoreProvider>
      </MemoryRouter>,
    );
    const named = (name: string) =>
      [...box.querySelectorAll("button")].find((each) => each.textContent.trim() === name);
    await vi.waitFor(() => {
      expect(box.textContent).toContain(address === null ? "Connect" : "g1jg8m…vsqf5");
    }, SOON);
    expect(box.querySelector("button button")).toBeNull();
    act(() => {
      named("Onyx")?.click();
    });
    await vi.waitFor(() => {
      expect(document.querySelectorAll("[role='menuitemradio']")).toHaveLength(2);
    }, SOON);
    expect(box.querySelector("button button")).toBeNull();
    expect(items(box)).not.toContain("Passport");
    act(() => {
      [...document.querySelectorAll<HTMLElement>("[role='menuitemradio']")]
        .find((each) => each.textContent === "gno.land")
        ?.click();
    });
    await settle();
    expect(adena.connect).not.toHaveBeenCalled();
    expect(items(box)).not.toContain("Passport");
  });
});
