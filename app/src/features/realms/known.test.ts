// @vitest-environment jsdom
import { createElement } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { knownOf } from "../../realmKnown.ts";
import { useKnown } from "./known.ts";
import type { Realm, RealmSource, realmPageQuery } from "./useRealm.ts";

const failed = (kind: string) => ({ state: "failed", failure: { kind, next: "" } }) as never;

test("a realm the chain says is no realm is known not to exist, even when a file listed it", () => {
  expect(knownOf(true, failed("no-realm"))).toBe("no");
});

test("a down or slow chain proves nothing: the page stays as it is", () => {
  expect(knownOf(false, failed("timeout"))).toBe("unknown");
  expect(knownOf(false, failed("down"))).toBe("unknown");
  expect(knownOf(false, undefined)).toBe("unknown");
  expect(knownOf(false, { state: "loading" })).toBe("unknown");
});

test("a realm listed, read, or with no page exists", () => {
  expect(knownOf(true, undefined)).toBe("yes");
  expect(knownOf(false, { state: "read" })).toBe("yes");
  expect(knownOf(false, failed("no-page"))).toBe("yes");
});

test("reads the realm's page from the cache without a fetch of its own: no missing query function is ever logged", () => {
  const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const Known = () => useKnown({ rpc: "https://rpc.example", realm: "gno.land/r/x/y", origin: undefined }, false);
  mount(createElement(Known));
  expect(said.mock.calls.flat().join(" ")).not.toMatch(/No queryFn/);
  said.mockRestore();
});

// The page's read, replaced by one the test answers: the real one asks the chain.
const asked = vi.hoisted((): { calls: number; answer: Realm | "no-realm" } => ({
  calls: 0,
  answer: { state: "loading" },
}));
vi.mock(import("./useRealm.ts"), async (original) => {
  const { queryOptions } = await import("@tanstack/react-query");
  const { keys } = await import("../../lib/query/keys.ts");
  const { Unread } = await import("../../lib/query/client.ts");
  return {
    ...(await original()),
    realmPageQuery: (({ rpc, realm, origin }: RealmSource) =>
      queryOptions({
        queryKey: keys.page(rpc, realm, origin),
        queryFn: (): Realm => {
          asked.calls += 1;
          const { answer } = asked;
          if (answer === "no-realm") throw new Unread(failed("no-realm"), { kind: "no-realm" });
          return answer;
        },
        retry: false,
      })) as unknown as typeof realmPageQuery,
  };
});

describe("the phone's ask", () => {
  // jsdom has no reportError, which the browser gives.
  beforeAll(() => {
    vi.stubGlobal("reportError", vi.fn());
  });
  const source = (realm: string) => ({ rpc: "https://rpc.example", realm, origin: undefined });
  const mounted = (realm: string, ask: boolean) => {
    const seen: string[] = [];
    const Probe = () => {
      seen.push(useKnown(source(realm), false, ask));
      return null;
    };
    mount(createElement(Probe));
    return seen;
  };

  test("reads the realm's page when asked, and knows a realm that exists", async () => {
    asked.calls = 0;
    asked.answer = { state: "read" } as Realm;
    const seen = mounted("gno.land/r/ask/yes", true);
    await settled(() => seen.at(-1) === "yes");
    expect(asked.calls).toBe(1);
  });

  test("knows a realm the chain says is none, so its page says so", async () => {
    asked.calls = 0;
    asked.answer = "no-realm";
    const seen = mounted("gno.land/r/ask/none", true);
    await settled(() => seen.at(-1) === "no");
    expect(seen).toContain("unknown");
  });

  test("reads nothing of its own on a computer, whose plate does", async () => {
    asked.calls = 0;
    const seen = mounted("gno.land/r/ask/computer", false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked.calls).toBe(0);
    expect(seen.at(-1)).toBe("unknown");
  });
});
