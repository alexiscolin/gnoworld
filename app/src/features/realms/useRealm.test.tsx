// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { queryClient } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { realmPage, useRealm, type Realm } from "./useRealm.ts";

// A realm's page as a query (slice 13): the held page in the first frame of a view seen again, the failure of a first read as a state of its own, the
// last good page left when a fresh read fails, and a read of another chain never shown for this one.
const SOURCE = { rpc: "https://rpc.one", realm: "gno.land/r/a/b", origin: undefined };
const fails = { fetch: () => Promise.reject(new Error("offline")) };
const seen: Realm[] = [];
function Reader({ rpc = SOURCE.rpc }: { rpc?: string }) {
  seen.push(useRealm({ ...SOURCE, rpc }, fails));
  return null;
}

describe("useRealm", () => {
  it("says loading, then the failure of a first read that did not come, with no page kept", async () => {
    seen.length = 0;
    mount(<Reader />);
    expect(seen.at(0)).toEqual({ state: "loading" });
    await settled(() => seen.at(-1)?.state === "failed");
    expect(queryClient.getQueryData(realmPage(SOURCE).queryKey)).toBeUndefined();
  });

  it("draws the kept page in its first frame, and leaves it when the fresh read fails", async () => {
    const kept: Realm = { state: "failed", failure: undefined };
    queryClient.setQueryData(keys.page(SOURCE.rpc, SOURCE.realm, undefined), kept, { updatedAt: 0 });
    seen.length = 0;
    mount(<Reader />);
    expect(seen.at(0)).toBe(kept);
    await settled(() => queryClient.isFetching() === 0);
    expect(seen.at(-1)).toBe(kept);
  });

  it("shows nothing of another chain's page for the same realm", () => {
    queryClient.setQueryData(keys.page("https://rpc.two", SOURCE.realm, undefined), {
      state: "failed",
      failure: undefined,
    });
    seen.length = 0;
    mount(<Reader />);
    expect(seen.at(0)).toEqual({ state: "loading" });
  });
});
