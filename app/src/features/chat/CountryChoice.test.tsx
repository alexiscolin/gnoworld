// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, one } from "../../../tests/mount.tsx";
import { keepCountry, keptCountry } from "../../lib/country.ts";
import { CountryChoice } from "./CountryChoice.tsx";

// D395 (amends 7j's opt-in): an account's lines show its time zone's country by default, the one it picks instead, or none once it hides
// it. The time zone is only a default shown, never written: the device holds a choice or the mark that it hides one, nothing else.
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

const inZone = (timeZone: string) =>
  vi
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockReturnValue({ ...new Intl.DateTimeFormat().resolvedOptions(), timeZone });
const list = (box: HTMLElement) => one(box, "select") as HTMLSelectElement;
const says = (box: HTMLElement) => one(box, "[role='status']").textContent;
const NONE = "Your messages show no country.";
function pick(box: HTMLElement, code: string) {
  const select = list(box);
  act(() => {
    select.value = code;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  inZone("Asia/Tokyo");
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the choice of a country", () => {
  it("shows the time zone's country by default, and keeps nothing of it", () => {
    const box = mount(<CountryChoice account={ME} />);
    expect(list(box).value).toBe("JP");
    expect(says(box)).toContain("set from your time zone");
    expect(keptCountry(ME)).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it("shows none, and does not read the time zone, once the account hid its country", () => {
    keepCountry(ME, undefined);
    const zone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    zone.mockClear();
    const box = mount(<CountryChoice account={ME} />);
    expect(list(box).value).toBe("");
    expect(says(box)).toBe(NONE);
    expect(zone).not.toHaveBeenCalled();
  });

  it("opens on the country this account chose, the time zone not read", () => {
    keepCountry(ME, "FR");
    const zone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    zone.mockClear();
    expect(list(mount(<CountryChoice account={ME} />)).value).toBe("FR");
    expect(zone).not.toHaveBeenCalled();
  });

  it("draws the list closed: it takes no focus", () => {
    const box = mount(<CountryChoice account={ME} />);
    expect(document.activeElement).not.toBe(list(box));
  });

  it("lists every country by name, in name order, hiding first", () => {
    const box = mount(<CountryChoice account={ME} />);
    const [none, ...countries] = [...list(box).options].map(({ text }) => text);
    expect(none).toBe("Hide my country");
    expect(countries).toHaveLength(250);
    expect(countries).toEqual(countries.toSorted((a, b) => a.localeCompare(b)));
    expect(new Set(countries).size).toBe(250);
  });

  it("pairs each name with its own code: the name read is the country sent", () => {
    const box = mount(<CountryChoice account={ME} />);
    const code = (name: string) => [...list(box).options].find(({ text }) => text === name)?.value;
    expect(code("France")).toBe("FR");
    expect(code("Japan")).toBe("JP");
    expect(code("Hide my country")).toBe("");
  });

  it("keeps a country taken from the list, and says what it means", () => {
    const box = mount(<CountryChoice account={ME} />);
    pick(box, "FR");
    expect(keptCountry(ME)).toBe("FR");
    expect(list(box).value).toBe("FR");
    expect(says(box)).toContain("public rooms");
  });

  it("hides the country with Hide my country: the device keeps the mark and nothing of the country", () => {
    keepCountry(ME, "FR");
    const box = mount(<CountryChoice account={ME} />);
    pick(box, "");
    expect(keptCountry(ME)).toBeUndefined();
    expect(says(box)).toBe(NONE);
    expect(list(box).value).toBe("");
    expect(Object.values(localStorage)).toEqual(['"hidden"']);
  });

  it("shows another account's choice to no one: each account has its own", () => {
    keepCountry(OTHER, "FR");
    keepCountry(ME, undefined);
    expect(list(mount(<CountryChoice account={ME} />)).value).toBe("");
  });

  it("follows the account: the next one to log in sees nothing of the last one's choice", () => {
    keepCountry(ME, "FR");
    keepCountry(OTHER, undefined);
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(<CountryChoice account={ME} />);
    });
    expect(list(host).value).toBe("FR");
    act(() => {
      root.render(<CountryChoice account={OTHER} />);
    });
    expect(list(host).value).toBe("");
    expect(says(host)).toBe(NONE);
    act(() => {
      root.unmount();
    });
  });

  it("says so when the device does not keep the choice, and does not claim it", () => {
    keepCountry(ME, undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const box = mount(<CountryChoice account={ME} />);
    pick(box, "FR");
    expect(box.textContent).toContain("Not kept on this device");
    expect(list(box).value).toBe("");
    expect(says(box)).toBe(NONE);
  });

  it("takes the words back once the device keeps a later choice", () => {
    keepCountry(ME, undefined);
    const refusal = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const box = mount(<CountryChoice account={ME} />);
    pick(box, "FR");
    refusal.mockRestore();
    pick(box, "JP");
    expect(box.textContent).not.toContain("Not kept on this device");
    expect(keptCountry(ME)).toBe("JP");
  });

  it("names its list for a screen reader", () => {
    expect(list(mount(<CountryChoice account={ME} />)).getAttribute("aria-label")).toBe("Your country");
  });
});
