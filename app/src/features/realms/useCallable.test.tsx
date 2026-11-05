// @vitest-environment jsdom
import type { ChainFetch } from "@gnoworld/chain/read";
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { CHAIN } from "../../../tests/callFixtures.ts";
import { useCallable } from "./useCallable.ts";

// 9e: what a reader of a realm's functions holds while the read is out. NOT recorded: the answer is never given.
function Probe({ fetch }: { fetch: ChainFetch }) {
  const listing = useCallable(CHAIN.rpc, "gno.land/r/demo/profile", { fetch });
  return <output>{JSON.stringify(listing)}</output>;
}

describe("useCallable", () => {
  it("holds exactly the loading listing while its read is out", () => {
    const box = mount(<Probe fetch={vi.fn<ChainFetch>(() => new Promise<Response>(() => undefined))} />);
    expect(box.querySelector("output")?.textContent).toBe('{"state":"loading"}');
  });
});
