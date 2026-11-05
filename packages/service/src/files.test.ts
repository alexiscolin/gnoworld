import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readDataFile } from "./files.ts";

const folder = mkdtempSync(join(tmpdir(), "gnoworld-files-"));
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});
const MiB = 1024 * 1024;

// The services' data files (10h's review, V8): Jarvis's places and the server's universes, read the same way.
describe("readDataFile", () => {
  it("reads a file of exactly 1 MiB whole, as UTF-8 text", () => {
    const path = join(folder, "exact.json");
    const text = `"${String.fromCodePoint(0xe9)}${"x".repeat(MiB - 4)}"`;
    writeFileSync(path, text);
    expect(Buffer.byteLength(text)).toBe(MiB);
    expect(readDataFile(path)).toBe(text);
  });

  it("refuses a file one byte past 1 MiB before reading it, naming nothing it holds", () => {
    const path = join(folder, "past.json");
    writeFileSync(path, `"${"x".repeat(MiB - 1)}"`);
    expect(() => readDataFile(path)).toThrow(new RangeError("past 1 MiB"));
  });

  it("lets the system's error rise for a file that is not there", () => {
    expect(() => readDataFile(join(folder, "none.json"))).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });
});
