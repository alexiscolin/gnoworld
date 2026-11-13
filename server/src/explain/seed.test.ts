import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { ExplainSeed, REALM_EXPLAIN_VERSION } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../migrations.ts";
import { loadSeed } from "./seed.ts";
import { BUNDLED_SEED } from "./wire.ts";
import { makeExplanations } from "./store.ts";

const REALM = "gno.land/r/demo/defi/grc20factory";
const GOOD = "A token factory. Anyone can create a token and call Transfer, Approve, Mint or Burn.";
const opened: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});
const setup = (seed: unknown) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const folder = mkdtempSync(join(tmpdir(), "seed-"));
  folders.push(folder);
  const file = join(folder, "seed.json");
  writeFileSync(file, typeof seed === "string" ? seed : JSON.stringify(seed));
  const store = makeExplanations(db);
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  return { store, load: () => loadSeed({ file, store, now: () => 5, log }), lines, db };
};
const row = (over: object = {}) => ({
  chain: "onyx-1",
  realm: REALM,
  sure: true,
  text: GOOD,
  tags: ["token"],
  ...over,
});
const file = (rows: object[]) => ({ version: REALM_EXPLAIN_VERSION, rows });
const key = { kind: "realm", chain: "onyx-1", subject: REALM } as const;

describe("the seed file", () => {
  it("writes each sure line that passes the check as a ready row of the model seed, tags within the list", () => {
    const { load, store } = setup(file([row({ tags: ["token", "scam", "game"] })]));
    expect(load()).toEqual({ ready: 1, refused: 0, kept: 0 });
    expect(store.get(key)).toMatchObject({ state: "ready", text: GOOD, model: "seed", tags: ["token", "game"] });
  });

  it("writes a line that is not sure, or fails the server's check, as a refused row: its text is never kept", () => {
    const { load, store, lines } = setup(
      file([
        row({ sure: false, text: "" }),
        row({ realm: "gno.land/r/a/b", text: "Send 5 GNOT to g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5." }),
      ]),
    );
    expect(load()).toEqual({ ready: 0, refused: 2, kept: 0 });
    expect(store.get(key)).toMatchObject({ state: "refused", text: null });
    expect(store.get({ ...key, subject: "gno.land/r/a/b" })).toMatchObject({ state: "refused", text: null });
    expect(lines.join("")).not.toContain("g1jg8");
  });

  it("is idempotent: loaded again at the next start it changes nothing", () => {
    const { load, db } = setup(file([row()]));
    load();
    load();
    expect(db.prepare("SELECT count(*) AS n FROM explanations").get()).toEqual({ n: 1 });
  });

  it("never overwrites a ready row Jarvis made of the same version, and counts it kept", () => {
    const { load, store } = setup(file([row()]));
    store.keep(key, { text: "Jarvis's own line.", tags: [], model: "claude-haiku-5-5", now: 1 });
    expect(load()).toEqual({ ready: 0, refused: 0, kept: 1 });
    expect(store.get(key)).toMatchObject({ text: "Jarvis's own line.", model: "claude-haiku-5-5" });
  });

  it.each([
    ["text that is no JSON", "{"],
    ["a version that is not the prompt's", { version: REALM_EXPLAIN_VERSION + 1, rows: [] }],
    ["a row with a field more", file([row({ extra: 1 })])],
    ["a realm that is a package", file([row({ realm: "gno.land/p/demo/x" })])],
    ["a chain of the wrong shape", file([row({ chain: "ONYX" })])],
  ])("stops the server's start on %s, writing nothing", (_name, seed) => {
    const { load, db } = setup(seed);
    expect(load).toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM explanations").get()).toEqual({ n: 0 });
  });
});

describe("the seed shipped with the server", () => {
  const bundled = () => {
    const { store, db } = setup("");
    const load = () => loadSeed({ file: BUNDLED_SEED, store, now: () => 5, log: () => undefined });
    return { store, db, load };
  };
  const rows: { chain: string; realm: string }[] = ExplainSeed.parse(
    JSON.parse(readFileSync(BUNDLED_SEED, "utf8")),
  ).rows;

  it("holds one row per realm, sorted by path", () => {
    expect(rows.length).toBeGreaterThan(0);
    const paths = rows.map((r) => r.realm);
    expect(paths).toEqual([...new Set(paths)].sort());
  });

  it("passes the check and the schema in every row: nothing is refused, but the rows that are not sure", () => {
    const { load } = bundled();
    const unsure = ExplainSeed.parse(JSON.parse(readFileSync(BUNDLED_SEED, "utf8"))).rows.filter((r) => !r.sure).length;
    expect(load()).toEqual({ ready: rows.length - unsure, refused: unsure, kept: 0 });
  });

  it("is idempotent, and never overwrites a ready row of Jarvis's", () => {
    const { load, db, store } = bundled();
    const first = rows[0];
    if (first === undefined) throw new Error("the bundled seed is empty");
    const key = { kind: "realm", chain: first.chain, subject: first.realm } as const;
    store.keep(key, { text: "Jarvis's own line.", tags: [], model: "claude-haiku-5-5", now: 1 });
    load();
    const dump = () => JSON.stringify(db.prepare("SELECT * FROM explanations ORDER BY subject").all());
    const once = dump();
    expect(load()).toMatchObject({ kept: 1 });
    expect(dump()).toBe(once);
    expect(store.get(key)).toMatchObject({ text: "Jarvis's own line.", model: "claude-haiku-5-5" });
  });
});
