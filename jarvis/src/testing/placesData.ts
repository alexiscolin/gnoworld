// The places' data files a test writes in a folder of its own: two universes, two hubs, an ecosystem by
// default, each file as JSON unless a test gives its text; the folders are removed with `remove`.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const universe = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id === "onyx" ? "Onyx" : "gno.land",
  chainId: `${id}-1`,
  rpc: `https://rpc.${id}.example:443`,
  gnoweb: `https://${id}.example`,
  indexer: `https://indexer.${id}.example/graphql/query`,
  testnet: id === "onyx",
  ...over,
});

export const world = (slug: string, name: string, at = "onyx") => ({
  slug,
  name,
  description: `${name}, a world of gno.land made up for this test, long enough for its schema.`,
  universe: at,
});

export interface Files {
  universes?: unknown;
  hubs?: unknown;
  ecosystems?: unknown;
}

/** A maker of data folders, and the removal of every folder it made. */
export function placesData() {
  const folders: string[] = [];
  const folderOf = (files: Files = {}, raw: Record<string, string> = {}) => {
    const folder = mkdtempSync(join(tmpdir(), "gnoworld-places-"));
    folders.push(folder);
    const json: Required<Files> = {
      universes: [universe("onyx", { default: true }), universe("gnoland")],
      hubs: [world("bubble", "Bubble"), world("govdao", "GovDAO"), world("tower", "Tower", "gnoland")],
      ecosystems: [{ slug: "games", name: "Games", description: "Games played on chain.", universe: "onyx" }],
      ...files,
    };
    for (const [name, value] of Object.entries(json))
      writeFileSync(join(folder, `${name}.json`), JSON.stringify(value));
    for (const [name, text] of Object.entries(raw)) writeFileSync(join(folder, name), text);
    return folder;
  };
  const remove = () => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  };
  return { folderOf, remove };
}
