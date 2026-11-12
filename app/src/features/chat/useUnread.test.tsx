// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { drawer } from "../../../tests/mount.tsx";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { useUnread } from "./useUnread.ts";
import type { Result } from "../../lib/api/http.ts";
import { Address, type Unread } from "@gnoworld/schemas";

// Each world's count: asked on opening, on focus and every 30 s while the full chat shows, never when it is closed or the reader is a guest.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const ok = (worlds: Record<string, number>): Result<Unread> => ({ ok: true, value: { worlds } });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// The session is set before the probe's first render, as a page that has already logged in (or out) is.
function Session({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const store = useAppStore();
  const [ready] = useState(() => {
    if (signedIn) store.getState().loginActions.signedIn(ALICE);
    else store.getState().loginActions.signedOut();
    return true;
  });
  return ready ? children : null;
}

function setup(first: Result<Unread>, { signedIn = true, on = true } = {}) {
  const answers: Result<Unread>[] = [first];
  const counts = vi.fn(() => Promise.resolve(answers.shift() ?? first));
  const places = vi.fn(() => Promise.resolve({ ok: true, value: undefined } as const));
  const seen: Record<string, number>[] = [];
  function Probe({ open }: { open: boolean }) {
    seen.push(useUnread(open, { counts, places }));
    return null;
  }
  const render = drawer();
  const draw = (open: boolean) => {
    render(
      <StoreProvider>
        <Session signedIn={signedIn}>
          <Probe open={open} />
        </Session>
      </StoreProvider>,
    );
  };
  draw(on);
  return { draw, counts, places, answers, last: () => seen.at(-1) };
}

// Two minutes pass and the window takes focus: whatever would ask has asked.
const idle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
    window.dispatchEvent(new Event("focus"));
  });

describe("useUnread", () => {
  it("asks once on opening and holds the answer", async () => {
    const t = setup(ok({ bubble: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(t.counts).toHaveBeenCalledTimes(1);
    expect(t.last()).toEqual({ bubble: 3 });
  });

  it("asks again every 30 seconds while the chat shows", async () => {
    const t = setup(ok({ bubble: 3 }));
    t.answers.push(ok({ bubble: 4 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(t.counts).toHaveBeenCalledTimes(2);
    expect(t.last()).toEqual({ bubble: 4 });
  });

  it("asks again when the window takes focus", async () => {
    const t = setup(ok({ bubble: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(t.counts).toHaveBeenCalledTimes(2);
  });

  it("keeps the last number when a call fails", async () => {
    const t = setup(ok({ bubble: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    t.answers.push({ ok: false, reason: "network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(t.counts).toHaveBeenCalledTimes(2);
    expect(t.last()).toEqual({ bubble: 3 });
  });

  it("asks nothing and holds nothing while the chat is closed", async () => {
    const t = setup(ok({ bubble: 3 }), { on: false });
    await idle();
    expect(t.counts).not.toHaveBeenCalled();
    expect(t.last()).toEqual({});
  });

  it("stops asking and drops its number once the chat closes", async () => {
    const t = setup(ok({ bubble: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      t.draw(false);
    });
    await idle();
    expect(t.counts).toHaveBeenCalledTimes(1);
    expect(t.last()).toEqual({});
  });

  it("asks nothing of a guest", async () => {
    const t = setup(ok({ bubble: 3 }), { signedIn: false });
    await idle();
    expect(t.counts).not.toHaveBeenCalled();
    expect(t.last()).toEqual({});
  });
});
