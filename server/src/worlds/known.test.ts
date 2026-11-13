import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { worldsListing } from "./known.ts";

const dir = mkdtempSync(join(tmpdir(), "gnoworld-known-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const realm = (path: string) => ({
  path,
  deployer: null,
  deployerName: null,
  functions: [],
  imports: [],
  calls: null,
  callers: null,
  lastHeight: null,
});
const doc = (...paths: string[]) =>
  JSON.stringify({
    version: 1,
    universe: "onyx",
    updated: "2026-11-07T10:00:00.000Z",
    worlds: [{ id: "leon", namespace: "leon", realms: paths.map(realm) }],
  });
let n = 0;
const written = (text: string, at = 1_000): string => {
  n += 1;
  const file = join(dir, `worlds-${String(n)}.json`);
  writeFileSync(file, text);
  utimesSync(file, at, at);
  return file;
};

describe("the realms the worlds job knows", () => {
  it("says a realm the file lists is known, and one it does not list is not", () => {
    const known = worldsListing(written(doc("gno.land/r/leon"))).known;
    expect([known("gno.land/r/leon"), known("gno.land/r/other")]).toEqual([true, false]);
  });

  it("knows none while the file is not there, is no JSON or is not the worlds' file", () => {
    expect(worldsListing(join(dir, "none.json")).known("gno.land/r/leon")).toBe(false);
    expect(worldsListing(written("{")).known("gno.land/r/leon")).toBe(false);
    expect(worldsListing(written(JSON.stringify({ version: 2 }))).known("gno.land/r/leon")).toBe(false);
  });

  it("reads the file again when the job has written it anew, and only then", () => {
    const file = written(doc("gno.land/r/leon"));
    const known = worldsListing(file).known;
    expect(known("gno.land/r/leon")).toBe(true);
    writeFileSync(file, doc("gno.land/r/other"));
    utimesSync(file, 1_000, 1_000);
    expect(known("gno.land/r/other")).toBe(false);
    utimesSync(file, 2_000, 2_000);
    expect([known("gno.land/r/leon"), known("gno.land/r/other")]).toEqual([false, true]);
  });

  it("knows none once a file it had read is broken or gone, and no name of Object's", () => {
    const file = written(doc("gno.land/r/leon"));
    const known = worldsListing(file).known;
    expect([known("gno.land/r/leon"), known("__proto__"), known("constructor")]).toEqual([true, false, false]);
    writeFileSync(file, "{");
    utimesSync(file, 3_000, 3_000);
    expect(known("gno.land/r/leon")).toBe(false);
    rmSync(file);
    expect(known("gno.land/r/leon")).toBe(false);
  });

  it("reads a file the schema refuses once, not for each ask: the same file is not read again until it changes", () => {
    const file = written("{");
    const known = worldsListing(file).known;
    expect(known("gno.land/r/leon")).toBe(false);
    writeFileSync(file, doc("gno.land/r/leon"));
    utimesSync(file, 1_000, 1_000);
    expect(known("gno.land/r/leon")).toBe(false);
    utimesSync(file, 5_000, 5_000);
    expect(known("gno.land/r/leon")).toBe(true);
  });
});

describe("the worlds listing every reader shares (D413)", () => {
  const withCalls = (calls: Record<string, number | null>): string =>
    JSON.stringify({
      version: 1,
      universe: "onyx",
      updated: "2026-11-07T10:00:00.000Z",
      worlds: Object.entries(calls).map(([path, count]) => ({
        id: path.split("/")[2],
        namespace: path.split("/")[2],
        realms: [{ ...realm(path), calls: count }],
      })),
    });

  it("answers known and the paths from one read, and reads again only when the file's time changes", () => {
    const file = written(doc("gno.land/r/leon", "gno.land/r/other"));
    let reads = 0;
    const listing = worldsListing(file, (name) => {
      reads += 1;
      return readFileSync(name, "utf8");
    });
    expect([listing.known("gno.land/r/leon"), listing.known("gno.land/r/none")]).toEqual([true, false]);
    expect(listing.paths()).toEqual(["gno.land/r/leon", "gno.land/r/other"]);
    expect(listing.stamp()).toBe(1_000 * 1_000);
    expect(reads).toBe(1);
    writeFileSync(file, doc("gno.land/r/third"));
    utimesSync(file, 2_000, 2_000);
    expect(listing.known("gno.land/r/third")).toBe(true);
    expect(listing.known("gno.land/r/leon")).toBe(false);
    expect(listing.stamp()).toBe(2_000 * 1_000);
    expect(reads).toBe(2);
  });

  it("gives the parsed file to every reader from the same one read, none for a file that is broken", () => {
    const file = written(doc("gno.land/r/leon"));
    let reads = 0;
    const listing = worldsListing(file, (name) => {
      reads += 1;
      return readFileSync(name, "utf8");
    });
    expect(listing.known("gno.land/r/leon")).toBe(true);
    expect(listing.worlds()?.worlds[0]?.realms[0]?.path).toBe("gno.land/r/leon");
    expect(reads).toBe(1);
    expect(worldsListing(written("{")).worlds()).toBeUndefined();
  });

  it("gives the paths of the world with the most calls first, the file's order for the others", () => {
    const file = written(
      withCalls({ "gno.land/r/aaa/x": null, "gno.land/r/bbb/x": 5, "gno.land/r/ccc/x": null, "gno.land/r/ddd/x": 9 }),
    );
    expect(worldsListing(file).paths()).toEqual([
      "gno.land/r/ddd/x",
      "gno.land/r/bbb/x",
      "gno.land/r/aaa/x",
      "gno.land/r/ccc/x",
    ]);
  });

  it("has no stamp for a missing file, the file's time for a broken one, and knows no realm in either", () => {
    const missing = worldsListing(join(dir, "none.json"));
    expect([missing.paths(), missing.known("gno.land/r/leon"), missing.stamp()]).toEqual([[], false, undefined]);
    const broken = worldsListing(written("{"));
    expect([broken.known("gno.land/r/leon"), broken.paths(), broken.stamp()]).toEqual([false, [], 1_000 * 1_000]);
  });

  it("gives every path of a good file, and none for a file that is not the worlds'", () => {
    expect(worldsListing(written(doc("gno.land/r/leon", "gno.land/r/leon/two"))).paths()).toEqual([
      "gno.land/r/leon",
      "gno.land/r/leon/two",
    ]);
    expect(worldsListing(written(JSON.stringify({ version: 2 }))).paths()).toEqual([]);
  });
});
