import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EarthOrbit, EarthRooms } from "@gnoworld/schemas";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import orbiting from "../data/earthOrbit.json" with { type: "json" };
import places from "../data/earthRooms.json" with { type: "json" };
import { loadData, MAX_FILE_BYTES } from "./dataFiles.ts";
import { inlineScripts, policy, sha256 } from "./csp.ts";
import { at, FAULTS, plant } from "./dataFixture.ts";
import { headerRules, nginxTable } from "../tests/e2e/cspFiles.mjs";
import { workshopDataFiles } from "../tests/e2e/workshopData.mjs";
import { headingOf } from "../tests/render.tsx";

/** The fault a planted change to the files makes `loadData` throw, or an empty string when the files load. */
const loads = (change: (f: Record<string, unknown>) => void) => {
  const dir = plant(change);
  try {
    loadData(dir);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    rmSync(dir, { recursive: true });
  }
};

// 5g: the origins of the default data's two RPCs (app/data/universes.json), the only hosts connect-src names besides 'self'.
const RPC_ORIGINS = ["https://rpc.gno.land", "https://rpc.onyx.testnets.gno.land"];
// R-F3: and of their chains' public indexers, which the data names too (`indexer`).
const INDEXER_ORIGINS = ["https://indexer.gno.land", "https://indexer.onyx.testnets.gno.land"];

// Markup, a comment opener and a line separator in a description: what JSON-LD must carry as text.
const HOSTILE = "</script><script>alert(1)</script><!-- \u2028";
/** The text of each JSON-LD script of a page, as the browser reads it. */
const ldScripts = (html: string): string[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "");

/** The pages of a build: the address each is served at and its html. */
function pagesOf(client: string): [string, string][] {
  return readdirSync(client, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [`/${file.replace(/(?:^|\/)index\.html$/, "")}`, readFileSync(join(client, file), "utf8")]);
}

/**
 * The policies a host holds for a page: _headers takes its address with and without its slash; nginx's table, also at its
 * file and at the $uri try_files leaves for its slashed address, the file joined without merging slashes (F2460).
 */
function lookups(
  address: string,
  headers: Map<string, string>,
  table: Map<string, string>,
): (readonly [string, string | undefined])[] {
  if (address.endsWith(".html"))
    return [
      ["_headers", headers.get(address)],
      ["nginx", table.get(address)],
    ];
  const slashed = address.endsWith("/") ? address : `${address}/`;
  return [
    ["_headers", headers.get(address)],
    ["_headers", headers.get(slashed)],
    ["nginx", table.get(address)],
    ["nginx", table.get(slashed)],
    ["nginx", table.get(`${slashed}index.html`)],
    ["nginx", table.get(`${slashed}/index.html`)],
  ];
}

/**
 * Every page's policy, in `_headers` and in nginx's table: exactly the hashes of the scripts the page holds (JSON-LD, a
 * data block, has none), each line under `cap` characters, the longest page named when one is not.
 */
async function expectPolicies(client: string, conf: string, cap: number): Promise<void> {
  const headers = headerRules(readFileSync(join(client, "_headers"), "utf8"));
  const table = nginxTable(readFileSync(conf, "utf8"));
  const pages = pagesOf(client);
  expect(pages.length).toBeGreaterThan(1);
  let longest = ["", 0] as [string, number];
  for (const [address, html] of pages) {
    const own = (await Promise.all(inlineScripts(html).map(sha256))).sort();
    for (const [where, policy] of lookups(address, headers, table)) {
      expect(policy, `${where} ${address}`).toBeDefined();
      expect(policy?.match(/'sha256-[^']+'/g)?.sort(), `${where} ${address}`).toEqual(own);
    }
    const length = `  Content-Security-Policy: ${headers.get(address) ?? ""}`.length;
    if (length > longest[1]) longest = [address, length];
  }
  // Five scripts a page, none shared as one list of every page's: the longest page is named when it is over.
  expect(longest[1], `the longest _headers line is ${longest[0]}`).toBeLessThan(cap);
}

// Slice 5's 5c: the data files read and checked at build time (docs/plans/slice-5.md §3, "Data files").
describe("loadData", () => {
  it("reads the fourteen files into their schemas' shapes", () => {
    const dir = plant();
    try {
      const data = loadData(dir);
      expect(data.universes.map((u) => u.id)).toEqual(["onyx", "gnoland"]);
      expect(data.hubs[0]?.slug).toBe("bubble");
      expect(data.ecosystems).toEqual([]);
      expect(Object.keys(data).sort()).toEqual([
        "bubbles",
        "earthOrbit",
        "earthRooms",
        "ecosystems",
        "events",
        "expedition",
        "genres",
        "hubs",
        "news",
        "onAir",
        "quests",
        "universes",
        "xPosts",
      ]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it.each(FAULTS)("refuses $name, naming $file and its $field", ({ plant: fault, file, field }) => {
    const dir = plant(fault);
    try {
      expect(() => loadData(dir)).toThrow(at(file, field));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // The message says which fault it found: no other fault's file and field match it.
  it.each(FAULTS)("names only $name's file and field, not another fault's", ({ plant: fault, file, field }) => {
    const dir = plant(fault);
    try {
      let message = "";
      try {
        loadData(dir);
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      for (const other of FAULTS)
        if (other.file !== file || other.field !== field) expect(message).not.toMatch(at(other.file, other.field));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // D122: the build names every fault of a file, one a line, where Jarvis's places name the first.
  it("names every fault of a file, one a line", () => {
    const dir = plant((files) => {
      const [hub] = files["hubs.json"] as Record<string, unknown>[];
      if (hub !== undefined) Object.assign(hub, { name: 7, description: 7 });
    });
    try {
      expect(() => loadData(dir)).toThrow(/^hubs\.json: \[0\]\.name: [^\n]+\nhubs\.json: \[0\]\.description: [^\n]+$/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("takes a file of the largest size, and refuses one byte more, naming it", () => {
    const pad = (n: number) => (f: Record<string, unknown>) => void (f["quests.json"] = `[]${" ".repeat(n)}`);
    const exact = plant(pad(MAX_FILE_BYTES - 2));
    const over = plant(pad(MAX_FILE_BYTES - 1));
    try {
      expect(loadData(exact).quests).toEqual([]);
      expect(() => loadData(over)).toThrow(/quests\.json: .*larger than/);
    } finally {
      rmSync(exact, { recursive: true });
      rmSync(over, { recursive: true });
    }
  });

  it("refuses a file that is no list, naming it", () => {
    const dir = plant((f) => {
      f["quests.json"] = {};
    });
    try {
      expect(() => loadData(dir)).toThrow(/quests\.json: \(file\)/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("refuses a file that is missing, naming it", () => {
    const dir = plant((f) => {
      delete f["quests.json"];
    });
    try {
      expect(() => loadData(dir)).toThrow(/quests\.json/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("refuses a file that is no JSON, naming it", () => {
    const dir = plant((f) => void (f["quests.json"] = "[1,"));
    try {
      expect(() => loadData(dir)).toThrow(/quests\.json/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // What worlds.ts held, moved and nothing more (the brief: "nothing invented"): one world, and the two networks it needs.
  it("reads the files the repository ships: Bubble, GovDAO and the stations round the Earth (8l) in Onyx, the build's default", () => {
    const data = loadData(new URL("../data", import.meta.url).pathname);
    expect(data.universes.map((u) => [u.id, u.default === true])).toEqual([
      ["onyx", true],
      ["gnoland", false],
    ]);
    // Each station round the Earth is a world of its own kind, at its slug (8l).
    expect(data.hubs.slice(2).map(({ slug, kind }) => [slug, kind])).toEqual(
      data.earthOrbit.map(({ slug }) => [slug, "station"]),
    );
    expect(data.hubs.slice(0, 2)).toEqual([
      {
        slug: "bubble",
        name: "Bubble",
        description:
          "Bubble, a world of gno.land: the BUBBLE token, its governance, and the games played with it on chain.",
        universe: "onyx",
        genre: "games",
        kind: "dapp",
      },
      {
        slug: "govdao",
        name: "GovDAO",
        description: "GovDAO, the governance of gno.land: its proposals and the votes that accept or refuse them.",
        universe: "onyx",
        realms: ["gno.land/r/gov/dao"],
        kind: "dao",
        actions: [{ label: "Vote", realm: "gno.land/r/gov/dao", function: "MustVoteOnProposalSimple", args: {} }],
      },
    ]);
    // The crumbs' one genre (8g, frame 104: "GAMES › DAPP").
    expect(data.genres).toEqual([{ slug: "games", name: "Games" }]);
    // events and news hold the ticker's placeholders, listed below.
    for (const empty of ["ecosystems"] as const) expect(data[empty]).toEqual([]);
  });

  it("refuses a list of universes that is empty: no default, so no build", () => {
    const dir = plant();
    writeFileSync(join(dir, "universes.json"), "[]");
    try {
      expect(() => loadData(dir)).toThrow(/universes\.json: \(file\)/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

// 7v: what turns round the Earth, the projects the team adds by hand (Alexis, 2026-11-03), checked when the app builds.
describe("earthOrbit.json", () => {
  it("stops the build on a project's address that is not https, and names the file", () => {
    const dir = plant((f) => {
      Reflect.set(f, "earthOrbit.json", [{ name: "gnosh.ai", url: "http://gnosh.ai" }]);
    });
    try {
      expect(() => loadData(dir)).toThrow(/^earthOrbit\.json: \[0\]\.url/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // A project's slug names the world whose page it links to: one no hub of the file holds would link to no page.
  it("stops the build on a project whose slug names no hub", () => {
    const dir = plant((f) => {
      Reflect.set(f, "earthOrbit.json", [{ name: "gnosh.ai", url: "https://gnosh.ai", slug: "mars" }]);
    });
    try {
      expect(() => loadData(dir)).toThrow(/^earthOrbit\.json: \[0\]\.slug: no hub of hubs\.json is named "mars"/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("ships gnosh.ai, Alexis's own link, among the projects", () => {
    expect(orbiting).toContainEqual(expect.objectContaining({ name: "gnosh.ai", url: "https://gnosh.ai" }));
    expect(() => EarthOrbit.parse(orbiting)).not.toThrow();
  });
});

// Slice 8: the expedition's stops, the quests' steps, what is on air and the events name worlds the site holds, each fault stopping the
// build with its file, its row and what it names; two stops of one world would make one visit reach both.
describe("the discovery's files", () => {
  const stop = (over: Record<string, unknown>) => ({
    id: "s",
    universe: "onyx",
    why: "Why go.",
    hub: "bubble",
    ...over,
  });
  const steps = (first: Record<string, unknown>) => [
    { id: "a", kind: "visit", title: "Go", ...first },
    { id: "z", kind: "call", title: "Do", realm: "gno.land/r/demo/x", function: "Do" },
  ];
  const quest = (first: Record<string, unknown>, universe = "onyx") => ({
    id: "q",
    universe,
    title: "Q",
    description: "D.",
    reward: "R",
    steps: steps(first),
  });

  it("takes stops and steps that name the site's hubs and realms", () => {
    expect(
      loads((f) => {
        f["expedition.json"] = [stop({}), stop({ id: "r", hub: undefined, realm: "gno.land/r/demo/x", name: "X" })];
        f["quests.json"] = [quest({ hub: "bubble" })];
      }),
    ).toBe("");
  });

  it("stops the build on a stop of a universe the site does not hold", () => {
    expect(loads((f) => void (f["expedition.json"] = [stop({ universe: "mars" })]))).toMatch(
      /^expedition\.json: \[0\]\.universe: no universe of universes\.json is named "mars"/,
    );
  });

  it("stops the build on a stop of a hub its universe does not hold, another universe's included", () => {
    expect(loads((f) => void (f["expedition.json"] = [stop({ hub: "mars" })]))).toMatch(
      /^expedition\.json: \[0\]\.hub: no hub of "onyx" is named "mars"/,
    );
    expect(loads((f) => void (f["expedition.json"] = [stop({ universe: "gnoland" })]))).toMatch(
      /^expedition\.json: \[0\]\.hub: no hub of "gnoland" is named "bubble"/,
    );
  });

  it("stops the build on two stops of one realm's world", () => {
    expect(
      loads(
        (f) =>
          void (f["expedition.json"] = [
            stop({ id: "a", hub: undefined, realm: "gno.land/r/demo/x", name: "X" }),
            stop({ id: "b", hub: undefined, realm: "gno.land/r/demo/x", name: "Y" }),
          ]),
      ),
    ).toMatch(/^expedition\.json: \[1\]: a second stop of the world "/);
  });

  it("stops the build on a quest of a universe the site does not hold, or a step of a hub it does not", () => {
    expect(loads((f) => void (f["quests.json"] = [quest({ hub: "bubble" }, "mars")]))).toMatch(
      /quests\.json: \[0\]\.universe: no universe/,
    );
    expect(loads((f) => void (f["quests.json"] = [quest({ hub: "mars" })]))).toMatch(
      /^quests\.json: \[0\]\.steps\[0\]\.hub: no hub of "onyx" is named "mars"/,
    );
  });

  it("stops the build on an event in a world no hub holds, and takes the Earth's and none", () => {
    const event = (world?: string) => ({
      id: "e",
      title: "E",
      start: "2026-11-05T18:00:00.000Z",
      link: "https://gno.land/",
      ...(world === undefined ? {} : { world }),
    });
    expect(loads((f) => void (f["events.json"] = [event("mars")]))).toMatch(
      /^events\.json: \[0\]\.world: no hub of hubs\.json is named "mars"/,
    );
    expect(
      loads(
        (f) => void (f["events.json"] = [event("earth"), { ...event("bubble"), id: "f" }, { ...event(), id: "g" }]),
      ),
    ).toBe("");
  });

  it("stops the build on an on-air line of a hub its universe does not hold", () => {
    const row = (hub: string) => [{ id: "a", universe: "onyx", title: "Live", hub }];
    expect(loads((f) => void (f["onAir.json"] = row("mars")))).toMatch(
      /^onAir\.json: \[0\]\.hub: no hub of "onyx" is named "mars"/,
    );
    expect(loads((f) => void (f["onAir.json"] = row("bubble")))).toBe("");
  });

  it("names every fault at once", () => {
    const said = loads((f) => {
      f["expedition.json"] = [stop({ hub: "mars" })];
      f["quests.json"] = [quest({ hub: "venus" })];
    });
    expect(said).toMatch(/"mars"/);
    expect(said).toMatch(/"venus"/);
  });
});

// 7f2: the places of the Earth's side rooms, one row a room, checked when the app builds.
describe("earthRooms.json", () => {
  it("stops the build on a place off the globe, and names the file", () => {
    const dir = plant((f) => {
      Reflect.set(f, "earthRooms.json", [{ room: "#earth/lisbon", lat: 91, lon: 0 }]);
    });
    try {
      expect(() => loadData(dir)).toThrow(/^earthRooms\.json: \[0\]\.lat/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("ships the side rooms that have a place, which the app reads as it is", () => {
    expect(places.length).toBeGreaterThan(0);
    expect(() => EarthRooms.parse(places)).not.toThrow();
  });
});

// Slice 6's 6a: the bubbles' rules (ADR-0001 §7), one object in app/data/bubbles.json, checked when the app builds.
describe("bubbles.json", () => {
  const planted = (change: (rules: Record<string, unknown>) => void) =>
    plant((f) => {
      change(f["bubbles.json"] as Record<string, unknown>);
    });
  const message = (dir: string): string => {
    try {
      loadData(dir);
    } catch (error) {
      return error instanceof Error ? error.message : "";
    } finally {
      rmSync(dir, { recursive: true });
    }
    return "";
  };

  it("is read as the rules, and the repository ships ADR-0001 section 7's starting values", () => {
    const data = loadData(new URL("../data", import.meta.url).pathname);
    expect(data.bubbles).toEqual({
      maxOnScreen: 6,
      showSeconds: 5,
      speakerDelaySeconds: 30,
      maxChars: 80,
      readLast: 500,
      maxAgeSeconds: 300,
    });
  });

  it.each([
    ["maxOnScreen", 13],
    ["showSeconds", 16],
    ["speakerDelaySeconds", 121],
    ["maxChars", 19],
    ["maxChars", 161],
    ["readLast", 2001],
    ["maxAgeSeconds", 29],
    ["maxAgeSeconds", 86_401],
    ["maxOnScreen", 0],
  ])("stops the build on %s of %d, naming the file and the field", (field, value) => {
    expect(
      message(
        planted((r) => {
          r[field] = value;
        }),
      ),
    ).toMatch(new RegExp(`^bubbles\\.json: ${field}\\b`));
  });

  it("stops the build on a missing rule, a wrong type, a list and an unknown rule, naming the file", () => {
    const fault = (change: (r: Record<string, unknown>) => void) => message(planted(change));
    expect(fault((r) => Reflect.deleteProperty(r, "maxChars"))).toMatch(/^bubbles\.json: maxChars\b/);
    expect(fault((r) => Reflect.set(r, "showSeconds", "5"))).toMatch(/^bubbles\.json: showSeconds\b/);
    expect(fault((r) => Reflect.set(r, "extra", 1))).toMatch(/^bubbles\.json: /);
    expect(message(plant((f) => Reflect.set(f, "bubbles.json", [])))).toMatch(/^bubbles\.json: \(file\)/);
  });

  it("stops the build when the file is missing or is no JSON", () => {
    expect(message(plant((f) => Reflect.deleteProperty(f, "bubbles.json")))).toMatch(/bubbles\.json/);
    expect(message(plant((f) => Reflect.set(f, "bubbles.json", "{")))).toMatch(/bubbles\.json/);
  });

  // 6b: the centres come from a public-domain source read, named in the header (the plan's question 3).
  it("names, in the header of the country table, a public-domain source and where it was read", () => {
    const table = new URL("../../packages/core/src/bubbles/countries.ts", import.meta.url).pathname;
    const header = readFileSync(table, "utf8").split("\n").slice(0, 6).join("\n");
    expect(header).toMatch(/public domain|CC0/i);
    expect(header).toMatch(/https:\/\/\S+/);
    expect(header).toMatch(/source/i);
  });

  // ADR-0001 §7's numbers live in the data file alone: the plan's "no number of §7 is written in code".
  it("leaves the rules' numbers out of the code of packages/core/src/bubbles", () => {
    const dir = new URL("../../packages/core/src/bubbles/", import.meta.url).pathname;
    const sources = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "countries.ts");
    expect(sources).toEqual(expect.arrayContaining(["pickBubbles.ts", "cut.ts", "rules.ts"]));
    for (const file of sources) {
      const code = readFileSync(join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code.match(/(?<![\w.])(?:5|6|30|80|500|5000|30000)(?![\w.])/g) ?? [], file).toEqual([]);
    }
  });
});

// Slice 5's 5c: a fault planted in a data file stops `react-router build`, naming the file and the field; good data builds
// its pages. The build runs in a copy of the app in the temp directory (its generated files stay out of the app's folder),
// node_modules linked; GNOWORLD_DATA points it at the planted data.
const BIN = new URL("../node_modules/@react-router/dev/bin.cjs", import.meta.url).pathname;
// StrykerJS runs the tests in a sandbox whose sources it has instrumented (hooks inside its mutant switches): the
// compiler refuses them, and a build in a child process reaches no mutant. The build takes the real sources.
const APP = new URL("..", import.meta.url).pathname.replace(/\/\.stryker-tmp\/sandbox-[^/]+\//, "/");
const KEPT = [
  "src",
  "data",
  "public",
  "lab.config.ts",
  "react-router.config.ts",
  "vite.config.ts",
  // vite.config.ts serves the workshop's data files through it.
  "tests/e2e/workshopData.mjs",
  "package.json",
  "tsconfig.json",
];

// The image takes app/build/client whole, so what builds there ships: the realism page goes beside the site for the journeys alone.
describe("the realism page", () => {
  it("is built by nothing the image runs", () => {
    const docker = readFileSync(join(APP, "..", "deploy", "web", "Dockerfile"), "utf8");
    const builds = docker.split("\n").filter((line) => /^RUN .*\bbuild\b/.test(line));
    expect(builds).toEqual(["RUN cd app && node_modules/.bin/react-router build"]);
    expect(docker).not.toContain("lab.config");
  });

  it("is imported by nothing in the site", () => {
    const source = join(APP, "src");
    const importing = readdirSync(source, { recursive: true })
      .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
      .filter((name) => /from "(?:\.\.\/)+lab\//.test(readFileSync(join(source, name), "utf8")));
    expect(importing).toEqual([]);
  });
});

describe("react-router build", () => {
  let root = "";
  let copy = "";
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "gnoworld-app-"));
    copy = join(root, "app");
    mkdirSync(copy);
    cpSync(join(APP, "..", "tsconfig.base.json"), join(root, "tsconfig.base.json"));
    for (const name of KEPT) cpSync(join(APP, name), join(copy, name), { recursive: true });
    symlinkSync(join(APP, "node_modules"), join(copy, "node_modules"));
  });
  afterAll(() => {
    rmSync(root, { recursive: true });
  });

  function build(data: string, more: Record<string, string> = {}) {
    rmSync(join(copy, "build"), { recursive: true, force: true });
    return spawnSync(process.execPath, [BIN, "build"], {
      cwd: copy,
      env: { ...process.env, GNOWORLD_DATA: data, ...more },
      encoding: "utf8",
    });
  }

  it.each(FAULTS)("stops on $name, naming $file and $field", { timeout: 120_000 }, ({ plant: fault, file, field }) => {
    const dir = plant(fault);
    try {
      const run = build(dir);
      expect(run.status).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toMatch(at(file, field));
      // Stopped by the data, before any page was written.
      expect(existsSync(join(copy, "build", "client", "index.html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // ADR-0002 §9: the gate's browsers have a software GPU, so a test build lets `?test-gpu` pass it. In a production build neither the
  // switch nor the journeys' door to the scene exists: the words are gone from every file the browser gets.
  it(
    "leaves nothing of the scene's test switch in a production build, and a test build holds it",
    { timeout: 240_000 },
    () => {
      const dir = plant(() => undefined);
      const client = join(copy, "build", "client");
      const holding = () =>
        readdirSync(client, { recursive: true })
          .filter((name) => /\.(?:js|html|data)$/.test(name))
          .filter((name) => /test-gpu|__gnoworld(?:Scene|Labels)/.test(readFileSync(join(client, name), "utf8")));
      try {
        const production = build(dir);
        expect(production.status, `${production.stdout}${production.stderr}`).toBe(0);
        const names = readdirSync(client, { recursive: true });
        expect(
          names.some((name) => /^assets\/scene-[\w-]{8}\.js$/.test(name)),
          "the scene's chunk under its own name",
        ).toBe(true);
        expect(holding()).toEqual([]);
        expect(
          names.filter((name) => name.startsWith("lab")),
          "the realism page is no part of a production build",
        ).toEqual([]);
        const test = build(dir, { VITE_GNOWORLD_TEST_GPU: "1" });
        expect(test.status, `${test.stdout}${test.stderr}`).toBe(0);
        expect(holding().length, "the words this looks for are the switch's").toBeGreaterThan(0);
      } finally {
        rmSync(dir, { recursive: true });
      }
    },
  );

  // The positive control: the data drives the pages. A build that ignored GNOWORLD_DATA, or kept a list in the config,
  // would write bubble alone; a config that failed on every build would write nothing. 5d: each place has its page, at its
  // path and at its canonical address: a world of another universe, the Earth of each universe, an ecosystem, the list.
  it(
    "writes the page of each place, at its path and its canonical address, and the list",
    { timeout: 120_000 },
    async () => {
      const dir = plant((files) => {
        const hubs = files["hubs.json"] as Record<string, unknown>[];
        hubs.push({ ...hubs[0], slug: "mars", name: "Mars" });
        hubs.push({ ...hubs[0], slug: "other", name: "Other", universe: "gnoland" });
        files["ecosystems.json"] = [
          { slug: "tokens", name: "Tokens", description: "The tokens of the chain.", universe: "onyx" },
        ];
      });
      try {
        const run = build(dir);
        expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
        const client = join(copy, "build", "client");
        const page = (...path: string[]) => readFileSync(join(client, ...path, "index.html"), "utf8");
        const pages: [string[], string, string][] = [
          // The default universe's count is the cosmos's, which the browser reads from the worlds' file (7n): none in the build, which keeps
          // the line's figure's room for it.
          [[], "Worlds in Onyx", "/net/onyx/"],
          [["w", "bubble"], "Bubble", "/net/onyx/w/bubble"],
          [["w", "mars"], "Mars", "/net/onyx/w/mars"],
          [["net", "onyx"], "Worlds in Onyx", "/net/onyx/"],
          [["net", "onyx", "w", "mars"], "Mars", "/net/onyx/w/mars"],
          [["net", "gnoland"], "\\d+ worlds? in gno\\.land", "/net/gnoland/"],
          [["net", "gnoland", "w", "other"], "Other", "/net/gnoland/w/other"],
          [["earth"], "Earth", "/net/onyx/earth"],
          [["net", "onyx", "earth"], "Earth", "/net/onyx/earth"],
          [["net", "gnoland", "earth"], "Earth", "/net/gnoland/earth"],
          [["e", "tokens"], "Tokens", "/net/onyx/e/tokens"],
          [["net", "onyx", "e", "tokens"], "Tokens", "/net/onyx/e/tokens"],
        ];
        for (const [path, heading, canonical] of pages) {
          const html = page(...path);
          const where = path.join("/") || "/";
          // The cosmos' heading is the hero's line (F3267), so a heading is a pattern, of its words whatever marks their parts.
          expect(headingOf(html), where).toMatch(new RegExp(`^${heading}$`));
          expect(html, where).toContain(`<link rel="canonical" href="https://gno.world${canonical}"/>`);
        }
        // The home lists the worlds of its universe alone, and the data's order is not a page.
        expect(page()).toContain(">Mars</a>");
        expect(page()).not.toContain(">Other</a>");
        expect(existsSync(join(client, "w", "other"))).toBe(false);
        expect(existsSync(join(client, "e", "other"))).toBe(false);
        // 5f: each page has a policy of its own, holding its own scripts' hashes and no other (csp.ts), in _headers and in
        // nginx's table.
        await expectPolicies(client, join(copy, "build", "csp.conf"), 2000);
        // F2458: buildEnd looked for sw.js before Vite's post hook wrote it, so a real build's _headers never held the worker's
        // rule (decisions, 2026-10-30) and the worker shipped with the catch-all's policy on a _headers host. One rule, the bare
        // policy, with the catch-all detached.
        expect(existsSync(join(client, "sw.js"))).toBe(true);
        const headers = readFileSync(join(client, "_headers"), "utf8");
        const rule = `\n/sw.js\n  ! Content-Security-Policy\n  Content-Security-Policy: ${policy([])}\n`;
        expect(headers.split(rule)).toHaveLength(2);
      } finally {
        rmSync(dir, { recursive: true });
      }
    },
  );

  // Slice 5 part 2, 5g: connect-src is 'self' and the data's https RPC origins, in every policy a build writes, printed at
  // build; a data file adding a host shows in the CSP, an http: one stops the build.
  it("writes connect-src as the data's RPC origins in every policy, and prints it", { timeout: 120_000 }, () => {
    const dir = plant((files) => {
      const universes = files["universes.json"] as Record<string, unknown>[];
      universes.push({
        id: "extra",
        name: "Extra",
        chainId: "extra-1",
        rpc: "https://rpc.extra.example:8443",
        gnoweb: "https://gnoweb.extra.example",
        indexer: "https://indexer.extra.example:8443/graphql/query",
        testnet: true,
      });
    });
    try {
      const run = build(dir);
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
      const want = [
        "https://rpc.extra.example:8443",
        "https://indexer.extra.example:8443",
        ...RPC_ORIGINS,
        ...INDEXER_ORIGINS,
      ].sort();
      const directive = `connect-src 'self' ${want.join(" ")}`;
      expect(run.stdout).toContain(`csp: ${directive}`);
      const client = join(copy, "build", "client");
      const rules = headerRules(readFileSync(join(client, "_headers"), "utf8"));
      const table = nginxTable(readFileSync(join(copy, "build", "csp.conf"), "utf8"));
      expect(rules.size).toBeGreaterThan(2);
      // The worker's script and nginx's default answer no page: 'self' alone (docs/decisions.md, 2026-10-31).
      const pages = [...rules, ...table].filter(([where]) => where !== "/sw.js" && where !== "default");
      expect(pages.length).toBeGreaterThan(2);
      for (const [where, csp] of pages)
        expect(
          csp.split("; ").filter((d) => d.startsWith("connect-src")),
          where,
        ).toEqual([directive]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // The schema's Link refuses http: before the csp code is reached: this guards the schema, the next test the csp code.
  it("stops on an http: RPC (the schema's guard), naming it, before any page is written", { timeout: 120_000 }, () => {
    const dir = plant((files) => {
      const universes = files["universes.json"] as Record<string, unknown>[];
      universes.push({
        id: "plain",
        name: "Plain",
        chainId: "plain-1",
        rpc: "http://rpc.plain.example:26657",
        gnoweb: "https://gnoweb.plain.example",
        indexer: "https://indexer.plain.example/graphql/query",
        testnet: true,
      });
    });
    try {
      const run = build(dir);
      expect(run.status).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toMatch(/universes\.json/);
      expect(`${run.stdout}${run.stderr}`).toMatch(/rpc/);
      expect(existsSync(join(copy, "build", "client", "index.html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // R-F3 (F2952): an indexer in the data is a source of connect-src like an RPC: http: stops the build at the schema, an odd host at csp.
  it.each([
    ["an http: indexer", "http://indexer.plain.example/graphql/query", /universes\.json/],
    ["a wildcard host", "https://*.indexer.example/graphql/query", /csp: .*indexer/],
    ["a directive after the host", "https://indexer.example;script-src/graphql/query", /csp: .*indexer/],
  ])("stops on %s, naming it, before any page is written", { timeout: 120_000 }, (_name, indexer, message) => {
    const dir = plant((files) => {
      const universes = files["universes.json"] as Record<string, unknown>[];
      universes.push({
        id: "odd",
        name: "Odd",
        chainId: "odd-1",
        rpc: "https://rpc.odd.example",
        gnoweb: "https://gnoweb.odd.example",
        indexer,
        testnet: true,
      });
    });
    try {
      const run = build(dir);
      const output = `${run.stdout}${run.stderr}`;
      expect(run.status).not.toBe(0);
      expect(output).toMatch(message);
      expect(existsSync(join(copy, "build", "client", "index.html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // The schema's Link lets a wildcard or a directive in a host through: only rpcOrigins stops it, before any page is written.
  it.each([
    ["a wildcard host", "https://*.rpc.example"],
    ["a directive after the host", "https://rpc.example;script-src"],
  ])("stops on an RPC with %s, naming it, before any page is written", { timeout: 120_000 }, (_name, rpc) => {
    const dir = plant((files) => {
      const universes = files["universes.json"] as Record<string, unknown>[];
      universes.push({
        id: "odd",
        name: "Odd",
        chainId: "odd-1",
        rpc,
        gnoweb: "https://gnoweb.odd.example",
        indexer: "https://indexer.odd.example/graphql/query",
        testnet: true,
      });
    });
    try {
      const run = build(dir);
      const output = `${run.stdout}${run.stderr}`;
      expect(run.status).not.toBe(0);
      expect(output).toMatch(/csp: .*rpc/);
      expect(output).toContain(rpc);
      expect(existsSync(join(copy, "build", "client", "index.html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Slice 5's 5e: the build writes what a search engine reads, from the same data: the mainnet's places in sitemap.xml, robots.txt
  // naming it, and the pages' tags (a testnet's page noindex, a card and a JSON-LD on each).
  it("writes sitemap.xml and robots.txt, and tags each page", { timeout: 120_000 }, async () => {
    const dir = plant((files) => {
      const hubs = files["hubs.json"] as Record<string, unknown>[];
      // Hostile text in a description, which the schema lets through: it must stay text in the page's JSON-LD.
      hubs.push({
        ...hubs[0],
        slug: "other",
        name: "Other",
        universe: "gnoland",
        description: `${HOSTILE} ${"B".repeat(60)}`,
      });
    });
    try {
      const run = build(dir);
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
      const client = join(copy, "build", "client");
      const sitemap = readFileSync(join(client, "sitemap.xml"), "utf8");
      const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]).sort();
      expect(locs).toEqual(
        [
          "https://gno.world/net/gnoland/",
          "https://gno.world/net/gnoland/earth",
          "https://gno.world/net/gnoland/w/other",
        ].sort(),
      );
      expect(readFileSync(join(client, "robots.txt"), "utf8")).toContain("Sitemap: https://gno.world/sitemap.xml");
      const page = (...path: string[]) => readFileSync(join(client, ...path, "index.html"), "utf8");
      const onyx = page("w", "bubble");
      expect(onyx).toContain('<meta name="robots" content="noindex"/>');
      expect(onyx).toContain('<meta name="twitter:card" content="summary"/>');
      expect(onyx).toMatch(/<script type="application\/ld\+json">[^<]*"@type":"WebPage"[^<]*<\/script>/);
      const mainnet = page("net", "gnoland", "w", "other");
      expect(mainnet).not.toContain('name="robots"');
      expect(mainnet).toContain('<meta name="twitter:card" content="summary"/>');
      // One JSON-LD, whose text is the description as planted; no second script the hostile text could have opened.
      const lds = ldScripts(mainnet);
      expect(lds).toHaveLength(1);
      expect(JSON.parse(lds[0] ?? "")).toMatchObject({ description: `${HOSTILE} ${"B".repeat(60)}` });
      expect(mainnet).not.toContain("<script>alert(1)");
      expect(mainnet.match(/<script\b/g)).toHaveLength(page("w", "bubble").match(/<script\b/g)?.length ?? -1);
      // A data block runs nothing, so the policy names no hash for it: it would only fill the header line.
      const policy = readFileSync(join(client, "_headers"), "utf8");
      for (const text of [...ldScripts(onyx), ...lds]) expect(policy).not.toContain(await sha256(text));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
  // 5f, F2362: the hostile description of 5e's test, in the pages the policy is read from: the page holds the scripts React
  // Router wrote and no other, so the escape of its JSON (React Router's own, markup.js) is pinned by the build. Five
  // inline scripts a page and a JSON-LD: the module, the scroll restoration, the context, the loader data, its close.
  it(
    "holds, in a page with a hostile description, the five scripts React Router writes and one JSON-LD block, and no other",
    { timeout: 120_000 },
    () => {
      const dir = plant((files) => {
        const hubs = files["hubs.json"] as Record<string, unknown>[];
        hubs.push({
          ...hubs[0],
          slug: "other",
          name: "Other",
          universe: "gnoland",
          description: `${HOSTILE} ${"B".repeat(60)}`,
        });
      });
      try {
        const run = build(dir);
        expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
        const client = join(copy, "build", "client");
        // A positive control: the description did reach the page, as the text of its one JSON-LD block.
        const hostile = readFileSync(join(client, "net", "gnoland", "w", "other", "index.html"), "utf8");
        expect(hostile).toContain("alert(1)");
        expect(hostile.match(/<script type="application\/ld\+json">/g)).toHaveLength(1);
        expect(hostile.match(/<script\b/g)).toHaveLength(6);
        for (const [address, html] of pagesOf(client)) {
          if (address === "/__spa-fallback.html") continue;
          expect(inlineScripts(html), address).toHaveLength(5);
          expect(html, address).not.toContain("<script>alert(1)");
          // The text closed nothing: the markup after it is the page's own.
          expect(html, address).not.toMatch(/<\/script><script>alert/);
        }
      } finally {
        rmSync(dir, { recursive: true });
      }
    },
  );

  // 5f: header size at the data's size and at 16 times it. Each page's policy holds its own scripts: a line of some 600
  // characters whatever the number of pages, where one policy for all of them passed 2,000 at about 7 worlds. The largest
  // page is named when a line is over the cap of a host that cuts a _headers line there (Cloudflare Pages).
  it.each([
    ["3 worlds", 3],
    // F2452: the most a host's 100 header rules take (four a world, and the catch-all).
    ["21 worlds, the most a host's 100 header rules take", 21],
  ])("keeps every page's policy line under 2,000 characters at %s", { timeout: 300_000 }, async (_, worlds) => {
    const dir = plant((files) => {
      const hubs = files["hubs.json"] as Record<string, unknown>[];
      for (let n = 1; n < worlds; n += 1) hubs.push({ ...hubs[0], slug: `w${String(n)}`, name: `World ${String(n)}` });
    });
    try {
      const run = build(dir);
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
      const client = join(copy, "build", "client");
      await expectPolicies(client, join(copy, "build", "csp.conf"), 2000);
      // The cap's check fails for its own reason, naming the longest page, when a line is over it.
      await expect(expectPolicies(client, join(copy, "build", "csp.conf"), 100)).rejects.toThrow(
        /the longest _headers line is \/\S*/,
      );
      // Two pages a world in the default universe, and the home, the earth, the list, the fallback.
      expect(pagesOf(client).length).toBeGreaterThanOrEqual(worlds * 2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // F2452: 16 times the data's size is past Cloudflare Pages' 100 header rules, which the build refuses rather than ship rules
  // the host may drop (a page without a rule has no policy there).
  it(
    "stops at 16 times as many worlds: 48 worlds make more _headers rules than a host takes",
    { timeout: 300_000 },
    () => {
      const dir = plant((files) => {
        const hubs = files["hubs.json"] as Record<string, unknown>[];
        for (let n = 1; n < 48; n += 1) hubs.push({ ...hubs[0], slug: `w${String(n)}`, name: `World ${String(n)}` });
      });
      try {
        const run = build(dir);
        expect(run.status).not.toBe(0);
        expect(`${run.stdout}${run.stderr}`).toMatch(/csp: _headers holds \d+ rules, past a host's 100/);
        expect(existsSync(join(copy, "build", "client", "_headers"))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true });
      }
    },
  );

  // F475: a script planted in a page fails the build and writes no policy. The page is planted through the app's own root
  // (a copy of it, as this describe's builds are), as a component of the app that wrote a script would.
  it("stops on a script planted in the pages: the build fails and writes neither policy", { timeout: 120_000 }, () => {
    const dir = plant();
    const root = join(copy, "src", "root.tsx");
    const original = readFileSync(root, "utf8");
    try {
      expect(original).toContain("<Scripts />");
      writeFileSync(
        root,
        original.replace("<Scripts />", '<Scripts /><script dangerouslySetInnerHTML={{ __html: "alert(1)" }} />'),
      );
      const run = build(dir);
      expect(run.status).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toMatch(/csp: .*script/);
      expect(existsSync(join(copy, "build", "client", "_headers"))).toBe(false);
      expect(existsSync(join(copy, "build", "csp.conf"))).toBe(false);
    } finally {
      writeFileSync(root, original);
      rmSync(dir, { recursive: true });
    }
  });
});

// The ticker's placeholders (Alexis, 2026-10-31), and the on-air line's and the post on X's (8i): named here, so none reaches a public deploy
// unnoticed; removing them is deleting these ids from their files and the lines below. No sample world, number or activity.
const DIR = new URL("../data/", import.meta.url);
const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, DIR), "utf8"));

interface Row {
  id: string;
  title: string;
  link: string;
  date?: string;
  start?: string;
  embed?: string;
}
const news = read("news.json") as Row[];
const events = read("events.json") as Row[];

/** The placeholders of the ticker, by id: three news and two events. Change this list only with the files. */
const SAMPLE_NEWS = ["sample-news-bubble-onyx", "sample-news-demo", "sample-news-testnet"];
const SAMPLE_EVENTS = ["sample-event-community-call", "sample-event-demo-session"];
/** The on-air line's placeholder and the post on X's (8i), one each, in files of their own. */
const SAMPLE_OTHERS = ["sample-on-air", "sample-x-latest"];
const OTHERS = ["onAir.json", "xPosts.json"];

describe("the ticker's placeholders", () => {
  beforeEach(() => {
    expect(news.length + events.length, "the files hold the five placeholders").toBe(5);
  });

  it("are the three news and the two events this list names, and nothing else", () => {
    expect(news.map((row) => row.id)).toEqual(SAMPLE_NEWS);
    expect(events.map((row) => row.id)).toEqual(SAMPLE_EVENTS);
  });

  it("are counted across every data file's text, not only the two lists: seven ids with the on-air line and the post on X, no eighth", () => {
    const files = readdirSync(DIR.pathname, { recursive: true }).filter(
      (file) => !file.includes("/") && file.endsWith(".json"),
    );
    const found = files.flatMap((file) =>
      [...readFileSync(new URL(file, DIR), "utf8").matchAll(/"id":\s*"(sample-[^"]*)"/g)].map((match) => match[1]),
    );
    expect(found.toSorted()).toEqual([...SAMPLE_NEWS, ...SAMPLE_EVENTS, ...SAMPLE_OTHERS].toSorted());
  });

  it("do not name a session of the product that no document has announced", () => {
    expect(events.map((row) => row.title).join(" | ")).not.toMatch(/gno\.world/i);
  });

  it("each begin with sample-, so they can be found and removed", () => {
    for (const row of [...news, ...events]) expect(row.id).toMatch(/^sample-/);
  });

  it("are the only sample- rows of the data: no sample world, ecosystem, station or number", () => {
    const files = readdirSync(DIR.pathname, { recursive: true }).filter(
      (file) =>
        !file.includes("/") &&
        file.endsWith(".json") &&
        file !== "news.json" &&
        file !== "events.json" &&
        !OTHERS.includes(file),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(new URL(file, DIR), "utf8"), file).not.toMatch(/sample/i);
  });

  it("pass the data files' own checks, as the build runs them", () => {
    const data = loadData(DIR.pathname);
    expect(data.news).toHaveLength(3);
    expect(data.events).toHaveLength(2);
  });

  it("are in English, short, and hold no digit, no markup and no address in their words: no number is made up", () => {
    for (const row of [...news, ...events]) {
      expect(row.title, row.id).toMatch(/^[A-Za-z][A-Za-z ',.:;()-]*$/);
      expect(row.title.length, row.id).toBeLessThanOrEqual(90);
    }
  });

  it("link to gno.land's own pages and to nothing else, over https", () => {
    for (const row of [...news, ...events]) {
      const url = new URL(row.link);
      expect(url.protocol, row.id).toBe("https:");
      expect(url.hostname === "gno.land" || url.hostname.endsWith(".gno.land"), `${row.id}: ${url.hostname}`).toBe(
        true,
      );
      expect(url.username + url.password, row.id).toBe("");
    }
  });

  it("embed nothing: no player, so no request before a click", () => {
    for (const row of news) expect(row.embed, row.id).toBeUndefined();
  });

  it("say what is true of this product: Bubble's rooms on Onyx, the demo and the testnet are named", () => {
    const text = news.map((row) => row.title).join(" | ");
    expect(text).toMatch(/bubble/i);
    expect(text).toMatch(/onyx/i);
    expect(text).toMatch(/demo/i);
    expect(text).toMatch(/testnet/i);
  });

  it("hold a community call whose date is to be confirmed, in its own words, which the ticker does not show", () => {
    const call = events.find((row) => row.id === "sample-event-community-call");
    expect(call?.title).toMatch(/community call/i);
    expect(call?.title).toMatch(/date to be confirmed/i);
  });

  it("hold no date that was made up: an event waiting for its date starts at the one far-off sentinel, which the ticker never shows", () => {
    // The schema asks for a start; until the real one is known, a sentinel past every clock keeps the gate off the calendar, and the
    // ticker shows no event that starts there (7t). A real start replaces it with the content; this test then lists the event's id out.
    for (const row of events) {
      expect(row.title, row.id).toMatch(/date to be confirmed/i);
      expect(row.start ?? "", row.id).toMatch(/^2099-12-\d\dT00:00:00Z$/);
    }
  });

  it("date no news from a day that has not come", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const row of news) expect(row.date ?? "", row.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const row of news) expect((row.date ?? "") <= today, `${row.id}: ${row.date ?? ""}`).toBe(true);
  });
});

// 8g (frames 22 and 104): a world's kind and genre are its plate's crumb; a genre names one of genres.json.
describe("hubs.json's kind and genre", () => {
  const hub = (extra: Record<string, unknown>) => [
    { slug: "bubble", name: "Bubble", description: "B".repeat(60), universe: "onyx", ...extra },
  ];

  it("stops the build on a genre no genre of genres.json names, with its one-line fault", () => {
    expect(loads((f) => void (f["hubs.json"] = hub({ genre: "games" })))).toBe(
      'hubs.json: [0].genre: no genre of genres.json is named "games"',
    );
  });

  it("takes a genre genres.json names, and a world with none", () => {
    const named = (f: Record<string, unknown>) => {
      f["genres.json"] = [{ slug: "games", name: "Games" }];
      f["hubs.json"] = hub({ genre: "games", kind: "dapp" });
    };
    expect(loads(named)).toBe("");
    expect(loads((f) => void (f["hubs.json"] = hub({})))).toBe("");
  });

  it("names the row of each world whose genre is unknown", () => {
    const two = [...hub({}), { ...hub({ genre: "mars" })[0], slug: "other" }];
    expect(loads((f) => void (f["hubs.json"] = two))).toMatch(/^hubs\.json: \[1\]\.genre: /);
  });

  it.each(["hub", "dao", "dapp", "station"])("takes the kind %s", (kind) => {
    expect(loads((f) => void (f["hubs.json"] = hub({ kind })))).toBe("");
  });

  it("stops the build on a kind the crumb does not know, naming the file and the field", () => {
    expect(loads((f) => void (f["hubs.json"] = hub({ kind: "planet" })))).toMatch(/^hubs\.json: \[0\]\.kind/);
  });
});

// The workshop's dev server serves the files the backend writes, and nothing else of their folder (vite.config.ts's workshopData).
let workshopDir = "";
/** What the middleware did with a request: `next` when it let it go on, else the status and body it sent. */
const asked = (url: string, method = "GET") =>
  new Promise<{ next: true } | { status: number; body: string; type: string | undefined }>((done) => {
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200,
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      end: (body?: Uint8Array) => {
        done({ status: res.statusCode, body: new TextDecoder().decode(body), type: headers["content-type"] });
      },
    };
    workshopDataFiles(workshopDir)({ url, method }, res as unknown as ServerResponse, () => {
      done({ next: true });
    });
  });

describe("the workshop's data files", () => {
  beforeAll(() => {
    workshopDir = mkdtempSync(join(tmpdir(), "workshop-data-"));
    writeFileSync(join(workshopDir, "worlds.json"), '{"w":1}');
    writeFileSync(join(workshopDir, "markets.json"), '{"m":1}');
    writeFileSync(join(workshopDir, "secret.json"), '{"secret":1}');
    mkdirSync(join(workshopDir, "sub"));
    writeFileSync(join(workshopDir, "sub", "x.json"), "{}");
  });
  afterAll(() => {
    rmSync(workshopDir, { recursive: true, force: true });
  });

  it("serves the worlds' file and the prices' from the folder", async () => {
    expect(await asked("/worlds.json")).toEqual({ status: 200, body: '{"w":1}', type: "application/json" });
    expect(await asked("/markets.json")).toEqual({ status: 200, body: '{"m":1}', type: "application/json" });
  });

  it("answers a HEAD without a body and refuses a POST", async () => {
    expect(await asked("/worlds.json", "HEAD")).toEqual({ status: 200, body: "", type: "application/json" });
    expect(await asked("/worlds.json", "POST")).toEqual({ next: true });
  });

  it("answers 404 for a name the job has not written yet", async () => {
    expect(await asked("/worlds-count.json")).toMatchObject({ status: 404 });
  });

  it.each([
    "/worlds.json/../secret.json",
    "/worlds.json/../x",
    "/worlds.json/",
    "/worlds.json/x",
    "/markets.json?x",
    "/markets.json?x=1",
    "/markets.json#x",
    "/worlds.json%00",
    "/worlds%2ejson",
    "/%77orlds.json",
    "/worlds.json%2f..%2fsecret.json",
    "/..%2fsecret.json",
    "/../secret.json",
    "/secret.json",
    "/sub/x.json",
    "/sub/",
    "/",
    "//worlds.json",
    "/WORLDS.json",
    "worlds.json",
    "",
    "/markets.json.map",
  ])("lets %j go on to the app, and reads nothing", async (url) => {
    expect(await asked(url)).toEqual({ next: true });
  });
});
