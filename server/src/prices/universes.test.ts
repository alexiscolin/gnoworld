import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { doorSettings } from "../door/settings.ts";
import { defaultUniverse, hubRealms, hubWorlds } from "./universes.ts";

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

describe("defaultUniverse", () => {
  it("gives the RPC and the chain of the universe marked default, never another's", () => {
    const chosen = {
      id: "onyx",
      rpc: "https://rpc.default.example:443",
      chainId: "onyx-1",
      indexer: "https://indexer.default.example/graphql/query",
    };
    expect(defaultUniverse(planted(JSON.stringify([OTHER, ONYX])))).toEqual(chosen);
    expect(defaultUniverse(planted(JSON.stringify([ONYX, OTHER])))).toEqual(chosen);
  });

  it("reads the data the app ships: Onyx's RPC and chain, which is the default", () => {
    expect(defaultUniverse(DATA)).toEqual({
      id: "onyx",
      rpc: "https://rpc.onyx.testnets.gno.land:443",
      chainId: "onyx-1",
      indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
    });
  });

  it.each([
    ["a file that is no JSON", "{nope"],
    ["a list with no default", JSON.stringify([OTHER])],
    ["an RPC that is not https", JSON.stringify([{ ...ONYX, rpc: "http://rpc.default.example" }])],
    ["a universe with a field it does not know", JSON.stringify([{ ...ONYX, extra: 1 }])],
    ["no list", "{}"],
  ])("refuses %s, naming the file and none of its content", (_, content) => {
    const file = planted(content);
    expect(() => defaultUniverse(file)).toThrow(/universes/);
    expect(() => defaultUniverse(file)).toThrow(file);
    try {
      defaultUniverse(file);
    } catch (error) {
      expect(String(error)).not.toMatch(/nope|http:|extra/);
    }
  });

  it("refuses a file that is not there, naming it", () => {
    const file = join(dir, "missing.json");
    expect(() => defaultUniverse(file)).toThrow(file);
  });

  it("refuses a file past 1 MiB before reading it, as Jarvis's places and the app's build do (10h's review, V8)", () => {
    const at = JSON.stringify([ONYX]);
    const exact = planted(at.replace("[", `[${" ".repeat(1024 * 1024 - at.length)}`));
    expect(defaultUniverse(exact)).toEqual({
      id: "onyx",
      rpc: "https://rpc.default.example:443",
      chainId: "onyx-1",
      indexer: "https://indexer.default.example/graphql/query",
    });
    const past = planted(at.replace("[", `[${" ".repeat(1024 * 1024 + 1 - at.length)}`));
    expect(() => defaultUniverse(past)).toThrow(`universes: ${past} cannot be read`);
    expect(() => defaultUniverse(past)).toThrow(expect.objectContaining({ cause: new RangeError("past 1 MiB") }));
  });
});

describe("defaultUniverse", () => {
  it("gives the id, RPC, chain and indexer of the universe marked default, never another's", () => {
    const expected = {
      id: "onyx",
      rpc: "https://rpc.default.example:443",
      chainId: "onyx-1",
      indexer: "https://indexer.default.example/graphql/query",
    };
    expect(defaultUniverse(planted(JSON.stringify([OTHER, ONYX])))).toEqual(expected);
    expect(defaultUniverse(planted(JSON.stringify([ONYX, OTHER])))).toEqual(expected);
  });

  it("reads the data the app ships: Onyx, with its indexer", () => {
    expect(defaultUniverse(DATA)).toEqual({
      id: "onyx",
      rpc: "https://rpc.onyx.testnets.gno.land:443",
      chainId: "onyx-1",
      indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
    });
  });

  it("refuses a file with no default universe, naming the file and none of its content", () => {
    const file = planted(JSON.stringify([OTHER]));
    expect(() => defaultUniverse(file)).toThrow(file);
  });
});

// 7t3: the trends read a hub's rooms and its realms as one world, so the server knows each hub's world from the data the app is built from,
// hubs.json beside the universes' file, through the data's own schema; a bad file stops the server at boot, naming the file alone.
describe("hubWorlds", () => {
  const HUB = {
    name: "Bubble",
    description: "Bubble, a world of gno.land: its token, its governance and its games, played on chain.",
  };
  const pair = (hubs: string, universes = JSON.stringify([OTHER, ONYX])): string => {
    n += 1;
    const folder = join(dir, `pair${String(n)}`);
    mkdirSync(folder);
    writeFileSync(join(folder, "hubs.json"), hubs);
    const file = join(folder, "universes.json");
    writeFileSync(file, universes);
    return file;
  };

  it("names each hub of the default universe that lists realms by its slug with its first realm's world; one with none joins no chain world", () => {
    const hubs = [
      { ...HUB, slug: "bubble", universe: "onyx" },
      { ...HUB, slug: "govdao", universe: "onyx", realms: ["gno.land/r/gov/dao", "gno.land/r/gov/dao/v3/impl"] },
      { ...HUB, slug: "elsewhere", universe: "other", realms: ["gno.land/r/else/where"] },
    ];
    expect(hubWorlds(pair(JSON.stringify(hubs)))).toEqual(new Map([["govdao", "gov/dao"]]));
  });

  it("reads the data the app ships: GovDAO with its realm's world, and Bubble, which has no realm, joined to none", () => {
    expect(hubWorlds(DATA)).toEqual(new Map([["govdao", "gov/dao"]]));
  });

  it.each([
    ["a file that is no JSON", "{nope"],
    ["a hub with a field it does not know", JSON.stringify([{ ...HUB, slug: "bubble", universe: "onyx", extra: "x" }])],
    [
      "a hub whose realm is no realm path",
      JSON.stringify([{ ...HUB, slug: "bubble", universe: "onyx", realms: ["evil"] }]),
    ],
    ["no list", "{}"],
  ])("refuses %s, naming the file and none of its content", (_, content) => {
    const file = pair(content);
    const hubs = join(file, "..", "hubs.json");
    expect(() => hubWorlds(file)).toThrow(hubs);
    try {
      hubWorlds(file);
    } catch (error) {
      expect(String(error)).not.toMatch(/nope|extra|evil/);
    }
  });

  it("refuses a folder with no hubs.json beside the universes, naming it", () => {
    const file = planted(JSON.stringify([ONYX]));
    expect(() => hubWorlds(file)).toThrow("hubs.json");
  });

  // The pages the preview job captures (8f): the realms the team's data lists for the default universe, and no other.
  it("lists every realm of the default universe's hubs for the preview job, each once, by its path; another universe's none", () => {
    const hubs = [
      { ...HUB, slug: "bubble", universe: "onyx" },
      { ...HUB, slug: "govdao", universe: "onyx", realms: ["gno.land/r/gov/dao", "gno.land/r/gov/dao/v3/impl"] },
      { ...HUB, slug: "again", universe: "onyx", realms: ["gno.land/r/gov/dao"] },
      { ...HUB, slug: "elsewhere", universe: "other", realms: ["gno.land/r/else/where"] },
    ];
    expect(hubRealms(pair(JSON.stringify(hubs)))).toEqual(["gno.land/r/gov/dao", "gno.land/r/gov/dao/v3/impl"]);
    expect(hubRealms(DATA)).toEqual(["gno.land/r/gov/dao"]);
  });

  it("refuses a hubs.json that is no good list for the preview job too, naming the file and none of its content", () => {
    const file = pair(JSON.stringify([{ ...HUB, slug: "bubble", universe: "onyx", realms: ["https://evil.example"] }]));
    expect(() => hubRealms(file)).toThrow(join(file, "..", "hubs.json"));
    expect(() => hubRealms(file)).not.toThrow(/evil/);
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

// The node the door reads a mainnet name on (JARVIS_NAMES_RPC, D120), by the door's own default, never a copy of it.
const namesHost = () => new URL(z.object(doorSettings()).parse({}).JARVIS_NAMES_RPC).hostname;

describe("the way out's list", () => {
  it("names CoinGecko's, OpenAI's, the default RPC host, the names' node and the two indexers, each by its full name, and nothing else", () => {
    expect(DEFAULT_HOST).not.toBe("");
    expect([...allowed].sort()).toEqual(
      [
        "api.coingecko.com",
        "api.openai.com",
        DEFAULT_HOST,
        namesHost(),
        ...data.map((universe) => new URL(universe.indexer).hostname),
      ].sort(),
    );
  });

  it("names the host the data's default universe has now, not a copy that drifts from it", () => {
    expect(allowed).toContain(DEFAULT_HOST);
    expect(DEFAULT_HOST).toBe("rpc.onyx.testnets.gno.land");
    expect(namesHost()).toBe("rpc.gno.land");
  });

  // The indexers are let out, each by its full name (the worlds job, 7c): the describe below holds them, so only the gnoweb pages stay out here.
  it("lets no other universe's RPC out but the names' node, no gnoweb, nor a domain by a wildcard", () => {
    expect(OTHER_HOSTS.length).toBeGreaterThan(0);
    for (const host of OTHER_HOSTS.filter((other) => other !== namesHost())) expect(allowed).not.toContain(host);
    const pages = z
      .array(z.object({ indexer: z.url(), gnoweb: z.url() }))
      .parse(JSON.parse(read("app/data/universes.json")));
    for (const { gnoweb } of pages) expect(allowed).not.toContain(hostOf(gnoweb));
    expect(acl).not.toMatch(/\*/);
  });
});

describe("the server's data", () => {
  it("is the file the image copies, and the one the compose file names", () => {
    expect(dockerfile).toMatch(/^COPY app\/data\/universes\.json app\/data\/$/m);
    expect(dockerfile, "the hubs beside it, for the trends (7t3)").toMatch(/^COPY app\/data\/hubs\.json app\/data\/$/m);
    expect(compose).toMatch(/^\s+UNIVERSES_FILE: \/app\/app\/data\/universes\.json$/m);
  });
});

describe("deploy/test.sh", () => {
  it("expects the list's hosts from the data and the door, six of them, and no other host reached through the way out", () => {
    expect(script).toMatch(/the way out lets six hosts out/);
    expect(script).not.toMatch(/the way out lets (two|three|four|five) hosts out/);
    expect(script).toContain("app/data/universes.json");
  });

  it("proves the server reaches the default RPC and the names' node through the way out, and refuses Anthropic's API", () => {
    expect(script).toMatch(/the server reaches the default universe's RPC through the way out/);
    expect(script).toMatch(/the server reaches the names' node through the way out/);
    expect(script).toMatch(/https:\/\/api\.anthropic\.com\//);
    expect(script).not.toMatch(/"https:\/\/\$other_rpc\/"/);
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
    expect(script).toMatch(/mutant "another chain's node let out" "the way out lets six hosts out"/);
    expect(script).toMatch(/mutant "the default RPC's whole domain let out" "the way out lets six hosts out"/);
    expect(script).toMatch(
      /mutant "the names' node dropped from the way out" "the server does not reach the names' node"/,
    );
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
    ["Onyx's indexer's whole domain let out", "the way out lets six hosts out"],
    ["gno.land's indexer's whole domain let out", "the way out lets six hosts out"],
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

// The worlds file (7c) rides the volume the prices timer writes: the server writes it, web serves it read-only at /worlds.json
// beside /markets.json, with the same minute of cache. Docker is refused in the sandbox, so the files are read as text.
const nginx = read("deploy/web/nginx.conf");

describe("worlds.json's way to the page", () => {
  it("tells the server to write it in the folder of markets.json, the volume web mounts read-only", () => {
    const folder = /^\s+MARKETS_FILE: (\/\S+)\/markets\.json\s*$/m.exec(compose)?.[1];
    expect(folder).toBeDefined();
    expect(compose).toContain(`WORLDS_FILE: ${String(folder)}/worlds.json`);
  });
});

// The preview job's captures (8f) go the same way: written in that folder, served beside markets.json.
describe("previews.json's way to the page", () => {
  it("tells the server to write it in the folder of markets.json, the volume web mounts read-only", () => {
    const folder = /^\s+MARKETS_FILE: (\/\S+)\/markets\.json\s*$/m.exec(compose)?.[1];
    expect(folder).toBeDefined();
    expect(compose).toContain(`PREVIEWS_FILE: ${String(folder)}/previews.json`);
  });

  it("proves in the stack that the running job reads a page through the way out and writes no capture the check did not pass", () => {
    expect(script).toContain(
      'expect "the running preview job reads the hubs\' pages through the way out and writes only the captures the check passed"',
    );
    expect(script).toContain(`mutant "previews.json kept a year" "web serves previews.json with a short cache"`);
    expect(script).toContain(
      `mutant "web follows a link at previews.json" "web does not follow a link planted at previews.json"`,
    );
  });

  it("lets no host out for it: the job reads the chain through the RPC the way out already holds, never gnoweb", () => {
    const gnowebs = (JSON.parse(read("app/data/universes.json")) as { gnoweb: string }[]).map(
      ({ gnoweb }) => new URL(gnoweb).hostname,
    );
    expect(gnowebs.length).toBeGreaterThan(0);
    expect(allowed.filter((host) => host !== undefined && gnowebs.includes(host))).toEqual([]);
  });
});

// Its count (7n2), written beside it in the same pass, which the home's hero reads, goes the same way.
describe.each(["worlds.json", "worlds-count.json", "previews.json"])("%s's way to the page", (file) => {
  it("serves it from that folder beside markets.json, with no listing and no link followed, under the same password", () => {
    const block = nginx.split(`location = /${file} {`)[1]?.split("}")[0] ?? "";
    expect(block).toMatch(/root \/markets;/);
    expect(block).toMatch(/disable_symlinks on from=\$document_root;/);
    expect(block).toMatch(/try_files \$uri =404;/);
    expect(block).not.toMatch(/autoindex|auth_basic|add_header/);
    expect(nginx).toContain(`~^(200|304)/${file.replace(".", "\\.")}$ "public, max-age=60";`);
  });

  it("proves in the stack that web serves it from the volume, with a short cache, only with the password", () => {
    expect(script).toContain(`expect "web serves ${file} from the volume the server writes"`);
    expect(script).toContain(`expect "web serves ${file} with a short cache"`);
    expect(script).toContain(`expect "web serves ${file} only with the password"`);
  });

  it("has a mutant for the file not served and one for it served without the password, each killed by its check", () => {
    expect(script).toContain(`mutant "${file} is not served" "web serves ${file} from the volume the server writes"`);
    expect(script).toContain(`mutant "${file} open without the password" "web serves ${file} only with the password"`);
  });
});
