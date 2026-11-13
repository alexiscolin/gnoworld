import { describe, expect, it } from "vitest";
import { CallRequest } from "./call.ts";
import { ChainEvent } from "./chainEvents.ts";
import { Universes } from "./data.ts";
import { JarvisExplainRequest } from "./explain.ts";
import { ChainId as BarrelChainId, isRealmPath, RealmPath as BarrelRealmPath } from "./index.ts";
import { RealmPath as IndexerRealmPath } from "./indexer.ts";
import { JarvisAsk, JarvisChangeRequest, JarvisDigestRequest, JarvisQuestion } from "./jarvis.ts";
import { ChallengeRequest } from "./login.ts";
import { ChainId } from "./realmPath.ts";
import { RealmRoomRequest } from "./rooms.ts";

const CALLER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

// Every schema that names a realm by its path, so a realm one of them takes is never refused by another on its way to a signature.
const realmTakers = (): [string, (realm: string) => boolean][] => [
  ["RealmPath", (realm) => BarrelRealmPath.safeParse(realm).success],
  ["the indexer's RealmPath", (realm) => IndexerRealmPath.safeParse(realm).success],
  [
    "CallRequest",
    (realm) => CallRequest.safeParse({ chainId: "onyx-1", caller: CALLER, realm, func: "Do", args: [] }).success,
  ],
  ["RealmRoomRequest", (path) => RealmRoomRequest.safeParse({ path }).success],
  ["JarvisExplainRequest", (realm) => JarvisExplainRequest.safeParse({ chain: "onyx-1", realm }).success],
  ["JarvisDigestRequest", (realm) => JarvisDigestRequest.safeParse({ universe: "onyx", realm }).success],
  [
    "JarvisQuestion",
    (realm) => JarvisQuestion.safeParse({ ask: "function", room: "#demo", realm, function: "Do" }).success,
  ],
  [
    "JarvisAsk",
    (realm) => JarvisAsk.safeParse({ ask: "function", room: "#demo", realm, function: "Do", lines: [] }).success,
  ],
];

const TAKEN = (): string[] => [
  "gno.land/r/demo/my-realm",
  "gno.land/r/my-ns/x",
  "gno.land/r/gnoland/blog",
  "gno.land/r/demo/foo_bar",
  "gno.land/r/demo/a1/b2",
  "gno.land/r/demo",
  "gno.land/r/demo/test",
  "gno.land/r/demo/atest",
  `gno.land/r/demo/${"a".repeat(134)}`,
  `gno.land/r/${"n".repeat(128)}/${"a".repeat(116)}`,
];

const REFUSED = (): [string, string][] => [
  ["a namespace from a digit", "gno.land/r/1abc/x"],
  ["a folder from a digit", "gno.land/r/demo/1x"],
  ["a test's path", "gno.land/r/demo/x_test"],
  ["a namespace that is a test's path", "gno.land/r/x_test"],
  ["a file test's path", "gno.land/r/demo/x_filetest"],
  ["two separators in a row", "gno.land/r/demo/a__b"],
  ["a dash then an underscore", "gno.land/r/demo/a-_b"],
  ["a trailing dash", "gno.land/r/demo/foo-"],
  ["a leading underscore", "gno.land/r/demo/_foo"],
  ["257 characters", `gno.land/r/${"n".repeat(128)}/${"a".repeat(117)}`],
  ["a namespace of 129 characters", `gno.land/r/${"n".repeat(129)}/x`],
  ["a pure package", "gno.land/p/demo/avl"],
  ["no name after /r/", "gno.land/r/"],
  ["a trailing slash", "gno.land/r/demo/"],
  ["an empty segment", "gno.land/r/demo//x"],
  ["capitals", "gno.land/r/Demo/x"],
  ["a dot past the domain", "gno.land/r/demo/x.y"],
  ["a dot-dot", "gno.land/r/../p/x"],
  ["a newline", "gno.land/r/demo/x\n"],
  ["another domain", "evil.example/r/demo/x"],
  ["a render path", "gno.land/r/demo:x"],
  ["a sub-realm's mark", "gno.land/r/demo#x"],
];

describe("one realm path for every schema that names a realm (gno's grammar, mempackage.go:41-90 at v1.5.0)", () => {
  it.each(TAKEN())("is taken by every schema: %s", (realm) => {
    expect(realmTakers().filter(([, takes]) => !takes(realm))).toEqual([]);
  });

  it.each(REFUSED())("is refused by every schema: %s", (_, realm) => {
    expect(realmTakers().filter(([, takes]) => takes(realm))).toEqual([]);
  });

  it("is gno's own test, which reads a namespace of any length and any domain, the world's namespace cap being RealmPath's alone", () => {
    for (const realm of TAKEN()) expect(isRealmPath(realm)).toBe(true);
    for (const [name, realm] of REFUSED())
      expect(isRealmPath(realm), name).toBe(name === "a namespace of 129 characters" || name === "another domain");
    expect(isRealmPath(`gno.land/r/${"n".repeat(245)}`)).toBe(true);
    expect(isRealmPath(`gno.land/r/${"n".repeat(246)}`)).toBe(false);
  });

  it("is what a chain event names, with a namespace past a world's, as an address's nested names may be", () => {
    const deploy = (realm: string) =>
      ChainEvent.safeParse({ id: "h:0", kind: "deploy", universe: "onyx", realm, actor: CALLER, height: 1 }).success;
    expect([...TAKEN(), `gno.land/r/${"n".repeat(245)}`].filter((realm) => !deploy(realm))).toEqual([]);
    expect(REFUSED().filter(([name, realm]) => deploy(realm) && name !== "a namespace of 129 characters")).toEqual([]);
  });
});

// Every schema that names a chain by its id, and the universes' file that names each chain.
const chainTakers = (): [string, (chain: string) => boolean][] => [
  ["ChainId", (chain) => ChainId.safeParse(chain).success],
  ["the barrel's ChainId", (chain) => BarrelChainId.safeParse(chain).success],
  [
    "CallRequest",
    (chainId) =>
      CallRequest.safeParse({ chainId, caller: CALLER, realm: "gno.land/r/demo/x", func: "Do", args: [] }).success,
  ],
  ["ChallengeRequest", (chainId) => ChallengeRequest.safeParse({ chainId }).success],
  [
    "JarvisChangeRequest",
    (chainId) => JarvisChangeRequest.safeParse({ chainId, change: { setting: "quota", questions: 20 } }).success,
  ],
  ["JarvisExplainRequest", (chain) => JarvisExplainRequest.safeParse({ chain, realm: "gno.land/r/demo/x" }).success],
  [
    "JarvisAsk",
    (chain) =>
      JarvisAsk.safeParse({
        ask: "function",
        room: "#demo",
        realm: "gno.land/r/demo/x",
        function: "Do",
        chain,
        lines: [],
      }).success,
  ],
];

describe("one chain id for every schema that names a chain", () => {
  it.each(["onyx-1", "gnoland-1", "dev", "test_5", "c", "c".repeat(50)])("is taken by every schema: %s", (chain) => {
    expect(chainTakers().filter(([, takes]) => !takes(chain))).toEqual([]);
  });

  it.each([
    "",
    " onyx-1",
    "onyx-1 ",
    "ONYX-1",
    "onyx 1",
    "-onyx",
    "_onyx",
    "onyx.1",
    "onyx/1",
    "c".repeat(51),
    "c".repeat(64),
  ])("is refused by every schema: %j", (chain) => {
    expect(chainTakers().filter(([, takes]) => takes(chain))).toEqual([]);
  });

  it("is the universes' file's own, within its 40 characters", () => {
    const universe = (chainId: string) => ({
      id: "onyx",
      name: "Onyx",
      chainId,
      rpc: "https://rpc.example",
      gnoweb: "https://gnoweb.example",
      indexer: "https://indexer.example/graphql/query",
      testnet: true,
      default: true,
    });
    const takes = (chainId: string) => Universes.safeParse([universe(chainId)]).success;
    expect([takes("onyx-1"), takes("c".repeat(40)), takes("c".repeat(41))]).toEqual([true, true, false]);
    expect(["ONYX-1", " onyx-1", "onyx 1", "onyx.1", "-onyx"].filter(takes)).toEqual([]);
  });
});
