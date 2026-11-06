// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { Opened } from "./Opened.tsx";

// 8p (frames 6 and 17): the header's right end is one pill; logged in, the account's face and its address open the menu, which now holds the
// way out the login's own control held beside it.
const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const items = (box: HTMLElement) => [...box.querySelectorAll("[role='menuitem']")].map((item) => item.textContent);

vi.mock("react-router", () => ({
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
    expect(items(box)).toEqual(["Passport", "Saved", "Settings", "Log out"]);
    const out = [...box.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].at(-1);
    act(() => {
      out?.click();
    });
    expect(onLogOut).toHaveBeenCalledTimes(1);
  });

  it("offers no way out to a guest, whose menu is the device's", () => {
    const box = mount(<Opened address={undefined} lead={null} onLogOut={() => undefined} />);
    expect(items(box)).toEqual(["Passport", "Settings"]);
  });

  it("names its trigger the account and draws the lead it is given, the account's face and address", () => {
    const box = mount(<Opened address={ADDRESS} lead={<span data-face="" />} onLogOut={() => undefined} />);
    const trigger = box.querySelector("button:not([role='menuitem'])");
    expect(trigger?.textContent).toContain("Your account");
    expect(trigger?.querySelector("[data-face]")).not.toBeNull();
  });
});

// The header's account as the page mounts it (the red pass's high): the session read once, the way in, the pill, the way out through the
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
  it("logged out: one Connect Adena beside the device's menu, the session read once, a press starting the login once", async () => {
    api.me.mockResolvedValue({ ok: true, value: { address: null } });
    adena.connect.mockClear();
    const box = await mountMenu();
    await vi.waitFor(() => {
      expect(buttonsOf(box)).toEqual(["Menu", "Connect Adena"]);
    }, SOON);
    expect(api.me).toHaveBeenCalledTimes(1);
    act(() => {
      [...box.querySelectorAll("button")].find((each) => each.textContent === "Connect Adena")?.click();
    });
    await vi.waitFor(() => {
      expect(adena.connect).toHaveBeenCalledTimes(1);
    }, SOON);
    act(() => {
      box.querySelector<HTMLButtonElement>("button[aria-label='Menu']")?.click();
    });
    await vi.waitFor(() => {
      expect(items(box)).toEqual(["Passport", "Settings"]);
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
    expect(buttonsOf(box)).not.toContain("Connect Adena");
    await logOutThrough(box);
    await vi.waitFor(() => {
      expect(buttonsOf(box)).toContain("Connect Adena");
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
