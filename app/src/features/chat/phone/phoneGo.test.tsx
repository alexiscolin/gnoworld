// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubPhone } from "../../../../tests/phoneMedia.ts";
import { landingPaths } from "../../../lib/recents.ts";
import { usePhoneGo } from "./phoneGo.ts";

let root: Root | undefined;
let host: HTMLElement;
const held: { go?: (to: string) => void; type?: string } = {};

function Probe() {
  const going = usePhoneGo();
  const navigate = useNavigate();
  const type = useNavigationType();
  useEffect(() => {
    held.type = type;
    held.go = (to) => {
      Promise.resolve(navigate(to)).catch(reportError);
    };
  });
  const { pathname, search } = useLocation();
  return (
    <p>
      {going ? "going" : "here"} {pathname}
      {search}
    </p>
  );
}

const draw = (entries: string[], index = entries.length - 1) => {
  root = createRoot(host);
  act(() => {
    root?.render(
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Probe />
      </MemoryRouter>,
    );
  });
};
const shown = () => host.textContent;

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
  history.replaceState(null, "");
});

describe("a phone's own way to a place", () => {
  it("replaces a place's address with its full chat's", () => {
    stubPhone(true);
    draw(["/", "/w/govdao"]);
    expect(shown()).toBe("here /w/govdao?chat=full");
    expect(held.type, "a replace, not a push").toBe("REPLACE");
  });

  it("remembers the worlds and the Earth a phone is in, never a realm, as the next landing, one path", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    stubPhone(true);
    draw(["/w/govdao"]);
    act(() => {
      held.go?.("/r/gno.land/r/x?chat=full");
    });
    act(() => {
      held.go?.("/w/bubble?chat=full");
    });
    expect(landingPaths()).toEqual(["/w/bubble"]);
  });

  it("leaves a computer where it is", () => {
    stubPhone(false);
    draw(["/w/govdao"]);
    expect(shown()).toBe("here /w/govdao");
  });
});
