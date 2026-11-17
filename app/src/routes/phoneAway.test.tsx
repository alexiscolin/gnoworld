// @vitest-environment jsdom
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount } from "../../tests/mount.tsx";
import { stubPhone } from "../../tests/phoneMedia.ts";
import PhoneAway from "./PhoneAway.tsx";
import { phoneAway } from "./phoneAway.ts";

let host: HTMLElement;

function Probe() {
  const { pathname, search, hash } = useLocation();
  return (
    <>
      <PhoneAway home="/" />
      <p>
        {pathname}
        {search}
        {hash}
      </p>
    </>
  );
}

const draw = (phone: boolean, recent = "", at = "/") => {
  stubPhone(phone);
  vi.stubGlobal("localStorage", { getItem: () => recent, setItem: () => undefined });
  host = mount(
    <MemoryRouter initialEntries={[at]}>
      <Probe />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("takes a phone that hydrated on the home to its landing chat, by a replace", async () => {
  draw(true, "/w/bubble");
  await vi.waitFor(() => {
    expect(host.textContent).toBe("/w/bubble?chat=full");
  });
});

// A palette opened while the landing's code came (#search, usePaletteHistory.ts) goes with the phone, never closed under the finger.
it("keeps what the address's hash opened on the way", async () => {
  draw(true, "/w/bubble", "/#search");
  await vi.waitFor(() => {
    expect(host.textContent).toBe("/w/bubble?chat=full#search");
  });
});

const asWindow = (phone: boolean, recent = "") => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone && query === "(max-width: 899px)" }));
  vi.stubGlobal("localStorage", { getItem: () => recent, setItem: () => undefined });
};

it("sends a phone into the Earth's full chat, in the universe's own prefix, never a computer", async () => {
  asWindow(true);
  expect((await phoneAway("/"))?.headers.get("Location")).toBe("/earth?chat=full");
  const away = await phoneAway("/net/gnoland");
  expect(away?.status).toBe(302);
  expect(away?.headers.get("Location")).toBe("/net/gnoland/earth?chat=full");
  asWindow(false);
  expect(phoneAway("/")).toBeUndefined();
});

it("sends a phone back to the last world it was in", async () => {
  asWindow(true, "/r/gno.land/r/x\n/w/bubble");
  expect((await phoneAway("/"))?.headers.get("Location")).toBe("/w/bubble?chat=full");
});
