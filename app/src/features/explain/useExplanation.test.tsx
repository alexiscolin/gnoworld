// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { queryClient } from "../../lib/query/client.ts";
import { useExplanation } from "./useExplanation.ts";

// The explanation asked again every 4 s while the server makes it: at most 20 reads in all, none after a ready answer, so an open plate never
// polls the server for good.
const SUBJECT = { kind: "realm", chain: "onyx-1", subject: "gno.land/r/gov/dao" } as const;
const answer = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

function Shown() {
  return <p>{JSON.stringify(useExplanation(SUBJECT) ?? null)}</p>;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("an explanation being made", () => {
  it("is read again every 4 s, 20 times in all, then never", async () => {
    const fetched = vi.fn<(url: string) => Promise<Response>>(() => answer({ status: "making" }));
    vi.stubGlobal("fetch", fetched);
    mount(<Shown />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000 * 30);
    });
    expect(fetched).toHaveBeenCalledTimes(20);
    expect(fetched.mock.calls[0]?.[0]).toBe("/api/explanations/realm/onyx-1/gno.land%2Fr%2Fgov%2Fdao");
  });

  it("stops at the first ready answer, and shows it", async () => {
    const fetched = vi
      .fn<(url: string) => Promise<Response>>(() => answer({ status: "making" }))
      .mockImplementationOnce(() => answer({ status: "making" }))
      .mockImplementationOnce(() => answer({ status: "making" }))
      .mockImplementationOnce(() => answer({ status: "ready", text: "A realm that votes.", tags: [] }));
    vi.stubGlobal("fetch", fetched);
    const host = mount(<Shown />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000 * 30);
    });
    expect(fetched).toHaveBeenCalledTimes(3);
    expect(host.textContent).toBe(JSON.stringify({ status: "ready", text: "A realm that votes.", tags: [] }));
  });
});
