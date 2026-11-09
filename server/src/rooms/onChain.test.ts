import { describe, expect, it } from "vitest";
import { abciRefused, fakeChain, RPC } from "../testing/fakeWorldsChain.ts";
import { chainHas } from "./onChain.ts";

// D413: whether the chain holds a realm the worlds job does not list. vm/qpaths with the path as its prefix and a limit of one
// (checked with gnomcp on onyx: `gno.land/r/sys/namereg/v0` answers itself, `gno.land/r/sys/nothere` answers nothing).
const ON_CHAIN = [
  "gno.land/r/sys/namereg/v0",
  "gno.land/r/sys/namereg/v0/sub",
  "gno.land/r/leon",
  "gno.land/r/leon_two",
];
const byPrefix = (prefix: string): string =>
  ON_CHAIN.filter((path) => path.startsWith(prefix))
    .toSorted()
    .join("\n");

describe("whether a realm path is on the chain", () => {
  it("says yes for a path the chain lists exactly, asking one cheap read of that path, capped in time and size", async () => {
    const chain = fakeChain({ paths: byPrefix });
    expect(await chainHas({ send: chain.send, rpc: RPC })("gno.land/r/sys/namereg/v0")).toBe("yes");
    expect(chain.asked.length).toBe(1);
    expect(chain.asked[0]?.kind).toBe("vm/qpaths");
    expect(chain.asked[0]?.data).toBe("gno.land/r/sys/namereg/v0");
    expect(decodeURIComponent(chain.asked[0]?.url ?? "")).toContain("limit=1");
    expect(chain.asked[0]?.ms).toBeGreaterThan(0);
    expect(chain.asked[0]?.ms).toBeLessThanOrEqual(5_000);
  });

  it("says no for a path that is only the prefix of other realms: a longer path is no answer for a shorter one", async () => {
    const chain = fakeChain({ paths: byPrefix });
    const has = chainHas({ send: chain.send, rpc: RPC });
    expect(await has("gno.land/r/sys/namereg")).toBe("no");
    expect(await has("gno.land/r/leon_tw")).toBe("no");
    expect(chain.asked.length).toBe(2);
  });

  it("says no for a path the chain has no list for, and for one it refuses as no package", async () => {
    const empty = fakeChain({ paths: () => "" });
    expect(await chainHas({ send: empty.send, rpc: RPC })("gno.land/r/sys/nothere")).toBe("no");
    expect(empty.asked.length).toBe(1);
    const refused = fakeChain({ paths: () => abciRefused("/vm.InvalidPkgPathError") });
    expect(await chainHas({ send: refused.send, rpc: RPC })("gno.land/r/sys/nothere")).toBe("no");
    expect(refused.asked.length).toBe(1);
  });

  it("says down, not no, when the chain is not answering: another refusal, a status, a timeout, a network fault, an answer past the cap", async () => {
    const path = "gno.land/r/sys/namereg/v0";
    const other = fakeChain({ paths: () => abciRefused("/std.UnauthorizedError") });
    const status = fakeChain({ paths: () => new Response("boom", { status: 503 }) });
    const big = fakeChain({ paths: () => "x".repeat(64 * 1024) });
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const chains = [
      other,
      status,
      big,
      fakeChain({ paths: () => timeout }),
      fakeChain({ paths: () => new TypeError("fetch failed") }),
    ];
    for (const chain of chains) expect(await chainHas({ send: chain.send, rpc: RPC })(path)).toBe("down");
  });

  it("passes the timeout it was given to the call out, and asks nothing for a text that is no realm path", async () => {
    const chain = fakeChain({ paths: byPrefix });
    const has = chainHas({ send: chain.send, rpc: RPC, ms: 1_234 });
    await has("gno.land/r/leon");
    expect(chain.asked[0]?.ms).toBe(1_234);
    for (const text of ["gno.land/p/demo/avl", "", "gno.land/r/", "../etc", "gno.land/r/leon\ngno.land/r/other"])
      expect(await has(text), text).toBe("no");
    expect(chain.asked.length).toBe(1);
  });

  it("says yes when the chain keeps to the limit of one line: only the first sorted line of a prefix comes back, the path's own", async () => {
    // As the node answers (checked with gnomcp on onyx: `gno.land/r/sys/users` limit 1 is itself, before `gno.land/r/sys/users/init`).
    const chain = fakeChain({ paths: (prefix) => byPrefix(prefix).split("\n")[0] ?? "" });
    const has = chainHas({ send: chain.send, rpc: RPC });
    expect(await has("gno.land/r/leon")).toBe("yes");
    expect(await has("gno.land/r/sys/namereg/v0")).toBe("yes");
    expect(await has("gno.land/r/sys/namereg")).toBe("no");
  });

  it("takes an answer of exactly 1 KiB and says down for one byte more", async () => {
    const path = "gno.land/r/leon";
    const padded = (bytes: number): string => `${path}\n${"x".repeat(bytes - path.length - 1)}`;
    const at = fakeChain({ paths: () => padded(1_024) });
    expect(await chainHas({ send: at.send, rpc: RPC })(path)).toBe("yes");
    const over = fakeChain({ paths: () => padded(1_025) });
    expect(await chainHas({ send: over.send, rpc: RPC })(path)).toBe("down");
  });
});
