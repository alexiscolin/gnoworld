import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { allowlist } from "../allowlist.ts";
import { capture } from "../testing/kit.ts";
import { placesData, universe, world } from "../testing/placesData.ts";
import { loadPlaces, placesTool } from "./places.ts";

const { folderOf, remove } = placesData();
afterAll(remove);
const answer = async (folder: string, query: string) => {
  const ran = await placesTool(loadPlaces(folder)).run({ query });
  if (!ran.ok) throw new Error("the places tool failed");
  const json: unknown = JSON.parse(ran.text);
  return { ...ran, json };
};

describe("loadPlaces: the places' data, read once at start", () => {
  it("reads the app's own data files, the ones the site is built from", async () => {
    const shipped = fileURLToPath(new URL("../../../../app/data", import.meta.url));
    const { json } = await answer(shipped, "bubble");
    expect(json).toEqual({
      places: [{ kind: "world", name: "Bubble", universe: "onyx", path: "/w/bubble", canonical: "/net/onyx/w/bubble" }],
      more: 0,
    });
    expect(loadPlaces(shipped).universes.get("onyx")).toEqual({
      id: "onyx",
      name: "Onyx",
      chainId: "onyx-1",
      rpc: "https://rpc.onyx.testnets.gno.land:443",
      gnoweb: "https://onyx.testnets.gno.land",
    });
  });

  it("gives each universe's chain id, node and gnoweb, by its id", () => {
    const { universes } = loadPlaces(folderOf());
    expect([...universes.keys()]).toEqual(["onyx", "gnoland"]);
    expect(universes.get("gnoland")).toEqual({
      id: "gnoland",
      name: "gno.land",
      chainId: "gnoland-1",
      rpc: "https://rpc.gnoland.example:443",
      gnoweb: "https://gnoland.example",
    });
  });

  it("reads the files once: a folder gone after the start leaves every answer as it was", async () => {
    const folder = folderOf();
    const tool = placesTool(loadPlaces(folder));
    const before = await tool.run({ query: "govdao" });
    rmSync(folder, { recursive: true, force: true });
    expect(await tool.run({ query: "govdao" })).toEqual(before);
  });

  it.each([
    ["a hub its schema refuses", { hubs: [{ ...world("bubble", "Bubble"), slug: "Planted-Secret" }] }, "hubs.json"],
    ["no default universe", { universes: [universe("onyx"), universe("gnoland")] }, "universes.json"],
    ["a station in a universe not listed", { stations: [world("tower", "Tower", "planted-mars")] }, "stations.json"],
    [
      "an ecosystem's extra field",
      { ecosystems: [{ slug: "g", name: "G", description: "d", universe: "onyx", x: 1 }] },
      "ecosystems.json",
    ],
  ])("stops at start on %s, naming the file", (_case, files, name) => {
    expect(() => loadPlaces(folderOf(files))).toThrow(new RegExp(`^places: ${name.replace(".", "\\.")}`));
  });

  it("names a refused file and never a value it holds", () => {
    let thrown: unknown;
    try {
      loadPlaces(folderOf({ hubs: [{ ...world("bubble", "Bubble"), slug: "Planted-Secret" }] }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).not.toMatch(/Planted|Secret/);
  });

  it.each([
    [
      "no JSON",
      (folder: string) => {
        writeFileSync(join(folder, "hubs.json"), "{ planted");
      },
    ],
    [
      "past 1 MiB",
      (folder: string) => {
        writeFileSync(join(folder, "hubs.json"), `[${" ".repeat(1024 * 1024)}]`);
      },
    ],
    [
      "gone",
      (folder: string) => {
        rmSync(join(folder, "hubs.json"));
      },
    ],
  ])("stops at start on a file that is %s, naming it", (_case, spoil) => {
    const folder = folderOf();
    spoil(folder);
    expect(() => loadPlaces(folder)).toThrow(/^places: hubs\.json: /);
  });

  it("takes a file of exactly 1 MiB", () => {
    const hubs = JSON.stringify([world("bubble", "Bubble")]);
    const folder = folderOf({}, { "hubs.json": hubs.padEnd(1024 * 1024, " ") });
    expect(loadPlaces(folder).places.some((place) => place.path === "/w/bubble")).toBe(true);
  });
});

describe("find_place: a place's path and address, from the data alone", () => {
  it("answers a world by its name or its slug, in any case, with its universe, path and canonical address", async () => {
    const folder = folderOf();
    const govdao = {
      kind: "world",
      name: "GovDAO",
      universe: "onyx",
      path: "/w/govdao",
      canonical: "/net/onyx/w/govdao",
    };
    for (const query of ["GovDAO", "govdao", "GOVDAO", "gov"])
      expect((await answer(folder, query)).json).toEqual({ places: [govdao], more: 0 });
  });

  it("gives a place of another universe under its universe's prefix, and the cosmos and the Earth of each", async () => {
    const folder = folderOf();
    expect((await answer(folder, "tower")).json).toEqual({
      places: [
        {
          kind: "world",
          name: "Tower",
          universe: "gnoland",
          path: "/net/gnoland/w/tower",
          canonical: "/net/gnoland/w/tower",
        },
      ],
      more: 0,
    });
    expect((await answer(folder, "earth")).json).toEqual({
      places: [
        { kind: "earth", universe: "onyx", path: "/earth", canonical: "/net/onyx/earth" },
        { kind: "earth", universe: "gnoland", path: "/net/gnoland/earth", canonical: "/net/gnoland/earth" },
      ],
      more: 0,
    });
  });

  it("finds a place by every word of the query, its universe's name among them", async () => {
    const folder = folderOf();
    expect((await answer(folder, "gno.land cosmos")).json).toEqual({
      places: [{ kind: "cosmos", universe: "gnoland", path: "/net/gnoland/", canonical: "/net/gnoland/" }],
      more: 0,
    });
    expect((await answer(folder, "games ecosystem")).json).toEqual({
      places: [
        { kind: "ecosystem", name: "Games", universe: "onyx", path: "/e/games", canonical: "/net/onyx/e/games" },
      ],
      more: 0,
    });
  });

  it.each(["mars", "   ", ".*", "(", "\\", "[a-z]+"])(
    "says that no place matches %j, inventing none",
    async (query) => {
      const ran = await placesTool(loadPlaces(folderOf())).run({ query });
      expect(ran).toEqual({ ok: true, isError: false, text: "No place of gnoworld's data matches that query." });
    },
  );

  it("gives 20 places at most, in the data's order, and how many more match", async () => {
    const hubs = Array.from({ length: 30 }, (_hub, at) => world(`hub-${String(at)}`, `Hub ${String(at)}`));
    const { json } = await answer(folderOf({ hubs }), "hub");
    const listed = z.object({ places: z.array(z.object({ path: z.string() })), more: z.number() }).parse(json);
    expect(listed.more).toBe(10);
    expect(listed.places.map(({ path }) => path)).toEqual(
      Array.from({ length: 20 }, (_hub, at) => `/w/hub-${String(at)}`),
    );
  });

  it("is offered as a strict tool: a query of 1 to 80 characters, nothing else", () => {
    const { log, events } = capture();
    const tools = allowlist([placesTool(loadPlaces(folderOf())).definition], log);
    expect(tools.offered().map(({ name }) => name)).toEqual(["find_place"]);
    expect(tools.check("find_place", { query: "q".repeat(80) }).ok).toBe(true);
    for (const input of [{}, { query: "" }, { query: "q".repeat(81) }, { query: 4 }, { query: "bubble", limit: 5 }])
      expect(tools.check("find_place", input)).toEqual({ ok: false, reason: "bad_arguments" });
    expect(events().filter((event) => event["reason"] === "bad_arguments")).toHaveLength(5);
  });

  it("refuses a run with what its schema refuses, without reading anything", async () => {
    const tool = placesTool(loadPlaces(folderOf()));
    expect(await tool.run({ query: "" })).toEqual({ ok: false, reason: "refused" });
    expect(await tool.run(null)).toEqual({ ok: false, reason: "refused" });
  });
});
