import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadData, MAX_FILE_BYTES } from "./dataFiles.ts";
import { at, FAULTS, plant } from "./dataFixture.ts";

// Slice 5's 5c: the data files read and checked at build time (docs/plans/slice-5.md §3, "Data files").
describe("loadData", () => {
  it("reads the nine files into their schemas' shapes", () => {
    const dir = plant();
    try {
      const data = loadData(dir);
      expect(data.universes.map((u) => u.id)).toEqual(["onyx", "gnoland"]);
      expect(data.hubs[0]?.slug).toBe("bubble");
      expect(data.ecosystems).toEqual([]);
      expect(Object.keys(data).sort()).toEqual([
        "ecosystems",
        "events",
        "expedition",
        "genres",
        "hubs",
        "news",
        "quests",
        "stations",
        "universes",
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
  it("reads the files the repository ships: Bubble in Onyx, the build's default, and nothing else", () => {
    const data = loadData(new URL("../data", import.meta.url).pathname);
    expect(data.universes.map((u) => [u.id, u.default === true])).toEqual([
      ["onyx", true],
      ["gnoland", false],
    ]);
    expect(data.hubs).toEqual([
      {
        slug: "bubble",
        name: "Bubble",
        description:
          "Bubble, a world of gno.land: the BUBBLE token, its governance, and the games played with it on chain.",
        universe: "onyx",
      },
    ]);
    for (const empty of ["ecosystems", "stations", "genres", "events", "expedition", "quests", "news"] as const)
      expect(data[empty]).toEqual([]);
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

// Slice 5's 5c: a fault planted in a data file stops `react-router build`, naming the file and the field; good data builds
// its pages. The build runs in a copy of the app in the temp directory (its generated files stay out of the app's folder),
// node_modules linked; GNOWORLD_DATA points it at the planted data.
const BIN = new URL("../node_modules/@react-router/dev/bin.cjs", import.meta.url).pathname;
// StrykerJS runs the tests in a sandbox whose sources it has instrumented (hooks inside its mutant switches): the
// compiler refuses them, and a build in a child process reaches no mutant. The build takes the real sources.
const APP = new URL("..", import.meta.url).pathname.replace(/\/\.stryker-tmp\/sandbox-[^/]+\//, "/");
const KEPT = ["src", "data", "public", "react-router.config.ts", "vite.config.ts", "package.json", "tsconfig.json"];

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

  function build(data: string) {
    rmSync(join(copy, "build"), { recursive: true, force: true });
    return spawnSync(process.execPath, [BIN, "build"], {
      cwd: copy,
      env: { ...process.env, GNOWORLD_DATA: data },
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

  // The positive control: the data drives the pages. A build that ignored GNOWORLD_DATA, or kept a list in the config,
  // would write bubble alone; a config that failed on every build would write nothing. 5d: each place has its page, at its
  // path and at its canonical address: a world of another universe, the Earth of each universe, an ecosystem, the list.
  it("writes the page of each place, at its path and its canonical address, and the list", { timeout: 120_000 }, () => {
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
        [[], "gno.world", "/net/onyx/"],
        [["w", "bubble"], "Bubble", "/net/onyx/w/bubble"],
        [["w", "mars"], "Mars", "/net/onyx/w/mars"],
        [["net", "onyx"], "gno.world", "/net/onyx/"],
        [["net", "onyx", "w", "mars"], "Mars", "/net/onyx/w/mars"],
        [["net", "gnoland"], "gno.land", "/net/gnoland/"],
        [["net", "gnoland", "w", "other"], "Other", "/net/gnoland/w/other"],
        [["earth"], "Earth", "/net/onyx/earth"],
        [["net", "onyx", "earth"], "Earth", "/net/onyx/earth"],
        [["net", "gnoland", "earth"], "Earth", "/net/gnoland/earth"],
        [["e", "tokens"], "Tokens", "/net/onyx/e/tokens"],
        [["net", "onyx", "e", "tokens"], "Tokens", "/net/onyx/e/tokens"],
        [["list"], "Places", "/list"],
      ];
      for (const [path, heading, canonical] of pages) {
        const html = page(...path);
        const where = path.join("/") || "/";
        expect(html, where).toContain(`<h1>${heading}</h1>`);
        expect(html, where).toContain(`<link rel="canonical" href="https://gno.world${canonical}"/>`);
      }
      // The home lists the worlds of its universe alone, and the data's order is not a page.
      expect(page()).toContain(">Mars</a>");
      expect(page()).not.toContain(">Other</a>");
      expect(existsSync(join(client, "w", "other"))).toBe(false);
      expect(existsSync(join(client, "e", "other"))).toBe(false);
      // csp.ts's one header line holds every page's hashes: a host may cut a _headers line past 2,000 characters, and
      // each world now writes two pages in the default universe. This set has three worlds and an ecosystem.
      const headers = readFileSync(join(client, "_headers"), "utf8").split("\n")[1] ?? "";
      expect(headers.length, "the _headers policy line").toBeLessThan(2000);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
