import { describe, expect, it } from "vitest";
import {
  EXPLAIN_CAPS,
  ExplainSeed,
  Explanation,
  JarvisExplained,
  REALM_EXPLAIN_VERSION,
  REALM_TAGS,
  RealmExplanation,
  tagsOf,
} from "./explain.ts";
import { WORLD_NATURES } from "./worlds.ts";

const explained = {
  status: "explained",
  sure: true,
  text: "A token.",
  tags: ["token"],
  model: "m",
  version: 1,
  cost: 1,
};

describe("the closed tag list", () => {
  it("holds the world natures first, then the tags the outlines show, each once", () => {
    expect(REALM_TAGS.slice(0, WORLD_NATURES.length)).toEqual(WORLD_NATURES);
    expect(new Set(REALM_TAGS).size).toBe(REALM_TAGS.length);
    expect(REALM_TAGS).toEqual(expect.arrayContaining(["registry", "board", "social", "tool", "identity", "payments"]));
  });

  it("keeps the tags the list holds, once each, three at most, and drops a free word", () => {
    expect(tagsOf(["token", "scam", "TOKEN", "token", "board", "dao", "game", "<b>"])).toEqual([
      "token",
      "board",
      "dao",
    ]);
    expect(tagsOf([])).toEqual([]);
    expect(EXPLAIN_CAPS.tags).toBe(3);
  });
});

describe("what jarvis gives the server", () => {
  it("reads an explanation with tags of the list and refuses a tag outside it, a fifth tag, an extra field", () => {
    expect(JarvisExplained.safeParse(explained).success).toBe(true);
    expect(JarvisExplained.safeParse({ ...explained, tags: ["admin"] }).success).toBe(false);
    expect(JarvisExplained.safeParse({ ...explained, tags: ["token", "game", "dao", "nft"] }).success).toBe(false);
    expect(JarvisExplained.safeParse({ ...explained, extra: 1 }).success).toBe(false);
    expect(JarvisExplained.safeParse({ ...explained, cost: -1 }).success).toBe(false);
  });

  it("reads the model's own answer strictly: sure, text and tags, nothing more", () => {
    expect(RealmExplanation.safeParse({ sure: true, text: "x", tags: [] }).success).toBe(true);
    expect(RealmExplanation.safeParse({ sure: "yes", text: "x", tags: [] }).success).toBe(false);
    expect(RealmExplanation.safeParse({ sure: true, text: "x", tags: [], note: "y" }).success).toBe(false);
  });
});

describe("what a page and a seed file read", () => {
  it("reads ready, making and none, and refuses a ready with no text or a tag outside the list", () => {
    expect(Explanation.safeParse({ status: "ready", text: "A token.", tags: ["token"] }).success).toBe(true);
    expect(Explanation.safeParse({ status: "making" }).success).toBe(true);
    expect(Explanation.safeParse({ status: "ready", text: "", tags: [] }).success).toBe(false);
    expect(Explanation.safeParse({ status: "ready", text: "A.", tags: ["scam"] }).success).toBe(false);
  });

  it("reads a seed of the prompt's version only", () => {
    const row = { chain: "onyx-1", realm: "gno.land/r/a/b", sure: true, text: "A token.", tags: ["token"] };
    expect(ExplainSeed.safeParse({ version: REALM_EXPLAIN_VERSION, rows: [row] }).success).toBe(true);
    expect(ExplainSeed.safeParse({ version: REALM_EXPLAIN_VERSION + 1, rows: [row] }).success).toBe(false);
  });
});
