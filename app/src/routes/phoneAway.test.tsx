// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PhoneAway from "./PhoneAway.tsx";
import { phoneAway } from "./phoneAway.ts";

let root: Root | undefined;
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
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: phone && query === "(max-width: 899px)",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal("localStorage", { getItem: () => recent, setItem: () => undefined });
  root = createRoot(host);
  act(() => {
    root?.render(
      <MemoryRouter initialEntries={[at]}>
        <Probe />
      </MemoryRouter>,
    );
  });
};

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("reportError", vi.fn());
  host = document.body.appendChild(document.createElement("div"));
});
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host.remove();
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
