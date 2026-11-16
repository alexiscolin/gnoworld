// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canGoBack, useChatBack, usePhoneGo } from "./phoneGo.ts";

let root: Root | undefined;
let host: HTMLElement;
const held: { back?: () => void; go?: (to: string) => void } = {};

function Probe() {
  const going = usePhoneGo();
  const back = useChatBack();
  const navigate = useNavigate();
  useEffect(() => {
    held.back = back;
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
const phone = (matches: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches && query === "(max-width: 899px)",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
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
  history.replaceState(null, "");
});

describe("a phone's own way to a place", () => {
  it("replaces a place's address with its full chat's", () => {
    phone(true);
    draw(["/", "/w/govdao"]);
    expect(shown()).toBe("here /w/govdao?chat=full");
    act(() => {
      held.back?.();
    });
    expect(shown()).toBe("here /");
  });

  it("leaves a computer where it is", () => {
    phone(false);
    draw(["/w/govdao"]);
    expect(shown()).toBe("here /w/govdao");
  });
});

describe("the chat's back", () => {
  it("is the browser's back when the entry before is this site's", () => {
    expect(canGoBack({ idx: 1, key: "k" })).toBe(true);
    expect(canGoBack({ idx: 0, key: "k" })).toBe(false);
    expect(canGoBack(null)).toBe(false);
    expect(canGoBack({ idx: "1" })).toBe(false);
  });

  it("steps back in history, never forward to a place that sends it back", () => {
    phone(true);
    history.replaceState({ idx: 1 }, "");
    draw(["/", "/w/govdao?chat=full"]);
    act(() => {
      held.back?.();
    });
    expect(shown()).toBe("here /");
  });

  it("goes home, replacing the entry, when the chat was the first entry", () => {
    phone(true);
    history.replaceState({ idx: 0 }, "");
    draw(["/w/govdao?chat=full"]);
    act(() => {
      held.back?.();
    });
    expect(shown()).toBe("here /");
  });

  it("goes to the home of the universe the chat is in", () => {
    phone(true);
    draw(["/net/gnoland/w/memba?chat=full"]);
    act(() => {
      held.back?.();
    });
    expect(shown()).toBe("here /net/gnoland/");
  });

  it("reads the router's own index end to end: back from the second entry lands on the first", async () => {
    phone(true);
    history.replaceState(null, "", "/list");
    root = createRoot(host);
    act(() => {
      root?.render(
        <BrowserRouter>
          <Probe />
        </BrowserRouter>,
      );
    });
    act(() => {
      held.go?.("/w/govdao?chat=full");
    });
    expect(shown()).toBe("here /w/govdao?chat=full");
    act(() => {
      held.back?.();
    });
    await vi.waitFor(() => {
      expect(shown()).toBe("here /list");
    });
    history.replaceState(null, "", "/");
  });
});
