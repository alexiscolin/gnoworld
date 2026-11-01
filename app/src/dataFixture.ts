// The data files as the tests plant them: a good set, written to a directory, and the faults that must stop the build.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Files = Record<string, unknown>;

const GOOD: Files = {
  "universes.json": [
    {
      id: "onyx",
      name: "Onyx",
      chainId: "onyx-1",
      rpc: "https://rpc.onyx.testnets.gno.land:443",
      gnoweb: "https://onyx.testnets.gno.land",
      indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
      testnet: true,
      default: true,
    },
    {
      id: "gnoland",
      name: "gno.land",
      chainId: "gnoland-1",
      rpc: "https://rpc.gno.land:443",
      gnoweb: "https://gno.land",
      indexer: "https://indexer.gno.land/graphql/query",
      testnet: false,
    },
  ],
  "hubs.json": [{ slug: "bubble", name: "Bubble", description: "B".repeat(60), universe: "onyx" }],
  "ecosystems.json": [],
  "stations.json": [],
  "genres.json": [],
  "events.json": [],
  "expedition.json": [],
  "quests.json": [],
  "bubbles.json": {
    maxOnScreen: 6,
    showSeconds: 5,
    speakerDelaySeconds: 30,
    maxChars: 80,
    readLast: 500,
    maxAgeSeconds: 300,
  },
  "news.json": [{ id: "n1", title: "News", date: "2026-10-29", link: "https://gno.land/" }],
};

/** A copy of the good files with one changed, written to a new directory; returns the directory. */
export function plant(change: (files: Files) => void = () => undefined): string {
  const files = structuredClone(GOOD);
  change(files);
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-data-"));
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
  return dir;
}

const row = (files: Files, name: string): Record<string, unknown> =>
  (files[name] as Record<string, unknown>[])[0] ?? {};

/** A message that names the file, the row and the field, in the shape loadData writes: `news.json: [1].id: ...`. */
export const at = (file: string, field: string): RegExp =>
  new RegExp(`\\b${file.replace(".", "\\.")}: \\[\\d+\\]\\.${field}\\b`);

/** Each fault: what is planted, and the file and the field the message must name. */
export const FAULTS: readonly { name: string; file: string; field: string; plant: (files: Files) => void }[] = [
  {
    name: "a missing field",
    file: "hubs.json",
    field: "name",
    plant: (f) => {
      delete row(f, "hubs.json")["name"];
    },
  },
  {
    name: "a wrong type",
    file: "hubs.json",
    field: "description",
    plant: (f) => void (row(f, "hubs.json")["description"] = 7),
  },
  {
    name: "an http: link",
    file: "news.json",
    field: "link",
    plant: (f) => void (row(f, "news.json")["link"] = "http://gno.land/"),
  },
  {
    name: "a javascript: link",
    file: "news.json",
    field: "link",
    plant: (f) => void (row(f, "news.json")["link"] = "javascript:alert(1)"),
  },
  {
    name: "an embed host outside the allowlist",
    file: "news.json",
    field: "embed",
    plant: (f) => void (row(f, "news.json")["embed"] = "https://evil.example/embed/x"),
  },
  {
    name: "a duplicate id",
    file: "news.json",
    field: "id",
    plant: (f) => void (f["news.json"] = [row(f, "news.json"), row(f, "news.json")]),
  },
  {
    name: "a hub of a universe no file lists",
    file: "hubs.json",
    field: "universe",
    plant: (f) => void (row(f, "hubs.json")["universe"] = "mars"),
  },
];
