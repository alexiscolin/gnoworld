// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHere } from "./useHere.ts";

// The page reads who is here once a minute, however many components ask.
function Asker({ open = true, id }: { open?: boolean; id: string }) {
  return <p id={id}>{String(useHere(open).get("earth") ?? "none")}</p>;
}

const served = () =>
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ worlds: [{ world: "earth", here: 7, perHour: 0, rise: null }] }), {
        headers: { "content-type": "application/json" },
      }),
    ),
  );

describe("useHere", () => {
  beforeEach(() => {
    // Only the minute is the clock's: the query tells its readers by a real timer of its own.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.stubGlobal("reportError", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks the server once a minute for every component, and none while it is closed", async () => {
    const fetcher = served();
    vi.stubGlobal("fetch", fetcher);
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    act(() => {
      root.render(
        <>
          <Asker id="a" />
          <Asker id="b" />
          <Asker id="c" open={false} />
        </>,
      );
    });
    await vi.waitFor(() => {
      expect(host.querySelector("#a")?.textContent).toBe("7");
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.querySelector("#a")?.textContent).toBe("7");
    expect(host.querySelector("#b")?.textContent).toBe("7");
    // A closed asker holds no read of its own (one request in all); it sees the page's reading when another holds it.
    expect(host.querySelector("#c")?.textContent).toBe("7");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    act(() => {
      root.unmount();
    });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    host.remove();
  });
});
