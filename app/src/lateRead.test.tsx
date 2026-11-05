// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../tests/mount.tsx";
import { useLateRead } from "./lateRead.ts";

// A read a page asks once it runs (8g): none without a key, the answer for the key it was asked for only, one aborted when the key changes
// or the page leaves, a failure reported and not swallowed.
type Read = (key: string, signal: AbortSignal) => Promise<string | undefined>;
const seen: { value: string | undefined } = { value: undefined };

// The key can be moved from outside, as a page's route does.
const moved: { to: (key: string | undefined) => void } = { to: () => undefined };
function Reader({ at: first, read }: { at: string | undefined; read: Read }) {
  const [at, setAt] = useState(first);
  const value = useLateRead(at, read);
  useEffect(() => {
    seen.value = value;
  });
  useEffect(() => {
    moved.to = setAt;
  }, []);
  return null;
}
const flush = () => act(() => Promise.resolve());
afterEach(() => {
  seen.value = undefined;
  vi.unstubAllGlobals();
});

describe("a late read", () => {
  it("asks nothing without a key", async () => {
    const read = vi.fn<Read>();
    mount(<Reader at={undefined} read={read} />);
    await flush();
    expect(read).not.toHaveBeenCalled();
    expect(seen.value).toBeUndefined();
  });

  it("gives what the read answered for the key, once it came", async () => {
    const read = vi.fn<Read>((key) => Promise.resolve(`answer:${key}`));
    mount(<Reader at="a" read={read} />);
    expect(seen.value).toBeUndefined();
    await flush();
    expect(seen.value).toBe("answer:a");
    expect(read).toHaveBeenCalledExactlyOnceWith("a", expect.any(AbortSignal));
  });

  it("gives nothing for a read that gave nothing", async () => {
    mount(<Reader at="a" read={() => Promise.resolve(undefined)} />);
    await flush();
    expect(seen.value).toBeUndefined();
  });

  it("aborts the read of the old key and never shows its answer under the new one", async () => {
    const pending: { signal: AbortSignal; done: (value: string) => void }[] = [];
    const read: Read = (_key, signal) =>
      new Promise((done) => {
        pending.push({ signal, done });
      });
    mount(<Reader at="a" read={read} />);
    act(() => {
      moved.to("b");
    });
    expect(pending.map(({ signal }) => signal.aborted)).toEqual([true, false]);
    await act(async () => {
      pending[0]?.done("late");
      await Promise.resolve();
    });
    expect(seen.value).toBeUndefined();
    await act(async () => {
      pending[1]?.done("fresh");
      await Promise.resolve();
    });
    expect(seen.value).toBe("fresh");
    act(() => {
      moved.to("c");
    });
    expect(seen.value).toBeUndefined();
  });

  it("reports a read that failed, and says nothing", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const failure = new Error("down");
    mount(<Reader at="a" read={() => Promise.reject(failure)} />);
    await flush();
    expect(reported).toHaveBeenCalledExactlyOnceWith(failure);
    expect(seen.value).toBeUndefined();
  });
});
