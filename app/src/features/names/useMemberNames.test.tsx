// @vitest-environment jsdom
import { statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { keys } from "../../lib/query/keys.ts";
import { queryClient } from "../../lib/query/client.ts";
import { MAINNET_CHAIN } from "../../lib/chain/names.ts";
import { useMemberNames } from "./useMemberNames.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

function Names({ asked }: { asked: boolean }) {
  return <p>{JSON.stringify([...useMemberNames([ALICE, BOB], asked)])}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("the members' names under the composer", () => {
  it("asks the chains nothing before a mention is begun", () => {
    const fetched = vi.fn(() => Promise.reject(new Error("no network")));
    vi.stubGlobal("fetch", fetched);
    expect(mount(<Names asked={false} />).textContent).toBe("[]");
    expect(fetched).not.toHaveBeenCalled();
  });

  it("gives the name a chain read for an account, and none for one with no name", () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("no network")));
    queryClient.setQueryData(keys.name(MAINNET_CHAIN, ALICE, 0), { chainId: MAINNET_CHAIN, name: "alice", height: 7 });
    expect(mount(<Names asked />).textContent).toBe(JSON.stringify([[ALICE, "alice"]]));
  });

  // C14 of the review: the first @ in a busy room asks one block a chain, not one an account.
  it("asks each chain's block once for all the members, not once for each", async () => {
    const fetched = vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.endsWith("/status")
              ? statusEnvelope(100, "2026-11-06T05:59:58Z", url.includes("onyx") ? "onyx-1" : "gnoland-1")
              : { jsonrpc: "2.0", id: 1, error: { code: -1, message: "no" } },
          ),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetched);
    mount(<Names asked />);
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
    const heights = fetched.mock.calls.map(([url]) => url).filter((url) => url.endsWith("/status"));
    expect(heights).toHaveLength(2);
  });
});
