import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultRpc } from "./universes.ts";

// The default universe's RPC, read from the data the app is built from (app/data/universes.json, which the server's image holds):
// the one host the way out lets the server reach besides CoinGecko's and OpenAI's.
const DATA = new URL("../../../app/data/universes.json", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "gnoworld-universes-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let n = 0;
const planted = (content: string): string => {
  n += 1;
  const file = join(dir, `u${String(n)}.json`);
  writeFileSync(file, content);
  return file;
};
const ONYX = {
  id: "onyx",
  name: "Onyx",
  chainId: "onyx-1",
  rpc: "https://rpc.default.example:443",
  gnoweb: "https://gnoweb.default.example",
  indexer: "https://indexer.default.example/graphql/query",
  testnet: true,
  default: true,
};
const OTHER = { ...ONYX, id: "other", chainId: "other-1", rpc: "https://rpc.other.example:443", default: undefined };

describe("defaultRpc", () => {
  it("gives the RPC of the universe marked default, never another's", () => {
    expect(defaultRpc(planted(JSON.stringify([OTHER, ONYX])))).toBe("https://rpc.default.example:443");
    expect(defaultRpc(planted(JSON.stringify([ONYX, OTHER])))).toBe("https://rpc.default.example:443");
  });

  it("reads the data the app ships: Onyx's RPC, which is the default", () => {
    expect(defaultRpc(DATA)).toBe("https://rpc.onyx.testnets.gno.land:443");
  });

  it.each([
    ["a file that is no JSON", "{nope"],
    ["a list with no default", JSON.stringify([OTHER])],
    ["an RPC that is not https", JSON.stringify([{ ...ONYX, rpc: "http://rpc.default.example" }])],
    ["a universe with a field it does not know", JSON.stringify([{ ...ONYX, extra: 1 }])],
    ["no list", "{}"],
  ])("refuses %s, naming the file and none of its content", (_, content) => {
    const file = planted(content);
    expect(() => defaultRpc(file)).toThrow(/universes/);
    expect(() => defaultRpc(file)).toThrow(file);
    try {
      defaultRpc(file);
    } catch (error) {
      expect(String(error)).not.toMatch(/nope|http:|extra/);
    }
  });

  it("refuses a file that is not there, naming it", () => {
    const file = join(dir, "missing.json");
    expect(() => defaultRpc(file)).toThrow(file);
  });
});

// The egress proxy's list gains the default universe's RPC host from the data, and nothing else (decision of 2026-10-31). Docker is
// refused in this sandbox, so these read the files as text; deploy/test.sh and its `--mutants` rows are the run against the stack.
const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const acl = read("deploy/egress/acl.yaml");
const compose = read("deploy/compose.yaml");
const dockerfile = read("deploy/server/Dockerfile");
const script = read("deploy/test.sh");
const data = JSON.parse(read("app/data/universes.json")) as { rpc: string; indexer: string; default?: true }[];

const hostOf = (rpc: string) => new URL(rpc).hostname;
const chosen = data.find((universe) => universe.default === true);
const DEFAULT_HOST = hostOf(chosen?.rpc ?? "");
const OTHER_HOSTS = data.filter((universe) => universe.default !== true).map((universe) => hostOf(universe.rpc));
/** The hosts the list allows, as test.sh reads them: each `- name` line, quotes dropped. */
const allowed = [...acl.matchAll(/^\s+-\s*"?([^"\s#]+)"?\s*$/gm)].map((match) => match[1]);

describe("the way out's list", () => {
  it("names CoinGecko's, OpenAI's, the default RPC host and the two indexers, each by its full name, and nothing else", () => {
    expect(DEFAULT_HOST).not.toBe("");
    expect([...allowed].sort()).toEqual(
      [
        "api.coingecko.com",
        "api.openai.com",
        DEFAULT_HOST,
        ...data.map((universe) => new URL(universe.indexer).hostname),
      ].sort(),
    );
  });

  it("names the host the data's default universe has now, not a copy that drifts from it", () => {
    expect(allowed).toContain(DEFAULT_HOST);
    expect(DEFAULT_HOST).toBe("rpc.onyx.testnets.gno.land");
  });

  it("lets no other universe's RPC out, nor a domain by a wildcard", () => {
    expect(OTHER_HOSTS.length).toBeGreaterThan(0);
    for (const host of OTHER_HOSTS) expect(allowed).not.toContain(host);
    expect(acl).not.toMatch(/\*/);
  });
});

describe("the server's data", () => {
  it("is the file the image copies, and the one the compose file names", () => {
    expect(dockerfile).toMatch(/^COPY app\/data\/universes\.json app\/data\/$/m);
    expect(compose).toMatch(/^\s+UNIVERSES_FILE: \/app\/app\/data\/universes\.json$/m);
  });
});

describe("deploy/test.sh", () => {
  it("expects the list's hosts from the data, five of them, and no other host reached through the way out", () => {
    expect(script).toMatch(/the way out lets five hosts out/);
    expect(script).not.toMatch(/the way out lets three hosts out/);
    expect(script).toContain("app/data/universes.json");
  });

  it("proves the server reaches the default RPC through the way out, and a universe's other RPC stays refused", () => {
    expect(script).toMatch(/the server reaches the default universe's RPC through the way out/);
    expect(script).toMatch(/"https:\/\/\$other_rpc\/"/);
  });

  it("refuses a look-alike of the default RPC's host and its sibling gnoweb host, as CoinGecko's have, and sees the timer write a block", () => {
    expect(script).toMatch(/"https:\/\/\$rpc_host\.evil\.test\/"/);
    expect(script).toMatch(/"https:\/\/\$gnoweb_host\/"/);
    expect(script).toMatch(/the running timer writes the block height itself/);
  });

  it("holds the faults of this host in `--mutants`: its line gone, another RPC let out, its whole domain let out", () => {
    expect(script).toMatch(
      /mutant "the default RPC's host dropped from the way out" "the server does not reach the default universe's RPC"/,
    );
    expect(script).toMatch(/mutant "another universe's RPC let out" "the way out lets five hosts out"/);
    expect(script).toMatch(/mutant "the default RPC's whole domain let out" "the way out lets five hosts out"/);
  });
});

const INDEXER_HOSTS = data.map((universe) => new URL(universe.indexer).hostname);
const escaped = (host: string): string => host.replaceAll(".", "\\.");

describe("the way out for the indexers", () => {
  it("names each universe's indexer host in full, and no wildcard", () => {
    expect(INDEXER_HOSTS.length).toBeGreaterThanOrEqual(2);
    for (const host of INDEXER_HOSTS) expect(acl).toMatch(new RegExp(`^\\s+-\\s*"?${escaped(host)}"?\\s*$`, "m"));
    expect(acl).not.toMatch(/\*/);
  });

  // At red this passes: no host is there yet, so no sibling is. It fails the day a wildcard or a sibling is added.
  it("keeps a look-alike and a sibling of each indexer host out", () => {
    for (const host of INDEXER_HOSTS) {
      expect(acl).not.toContain(`${host}.evil`);
      expect(acl).not.toMatch(new RegExp(`^\\s+-\\s*"?[a-z0-9.-]+\\.${escaped(host)}"?\\s*$`, "m"));
    }
  });

  it.each([
    [
      "Onyx's indexer dropped from the way out",
      "the server does not reach the universe's indexer indexer.onyx.testnets.gno.land",
    ],
    [
      "gno.land's indexer dropped from the way out",
      "the server does not reach the universe's indexer indexer.gno.land",
    ],
    ["Onyx's indexer's whole domain let out", "the way out lets five hosts out"],
    ["gno.land's indexer's whole domain let out", "the way out lets five hosts out"],
  ])("has the mutant %j, killed by %j, which the stack's check also says", (label, wanted) => {
    expect(script).toContain(`mutant "${label}" "${wanted}"`);
    // Once in the mutant, once in the check itself (F695).
    expect(script.split(wanted.replace(/ indexer\.[a-z.]+$/, " $indexer_host")).length - 1).toBeGreaterThanOrEqual(1);
  });

  it("proves in the stack that the server reaches each indexer through the way out, and that a look-alike is refused", () => {
    expect(script).toMatch(/the server reaches the universe's indexer \$indexer_host through the way out/);
    expect(script).toMatch(/the server does not reach the universe's indexer \$indexer_host through the way out/);
    expect(script).toMatch(/"https:\/\/\$indexer_host\.evil\.test\/"/);
  });
});
