import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { replaceFile } from "./replaceFile.ts";

const folders: string[] = [];
const folder = (): string => {
  const made = mkdtempSync(join(tmpdir(), "replace-file-"));
  folders.push(made);
  return made;
};

afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
});

describe("replaceFile", () => {
  it("writes the file, readable by others, and leaves nothing beside it", () => {
    const dir = folder();
    const file = join(dir, "a.json");
    expect(replaceFile(file, "new")).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("new");
    expect(statSync(file).mode & 0o777).toBe(0o644);
    expect(readdirSync(dir)).toEqual(["a.json"]);
  });

  it("replaces a file that was there", () => {
    const file = join(folder(), "a.json");
    writeFileSync(file, "old");
    expect(replaceFile(file, "new")).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("new");
  });

  it("says false when the temporary cannot be written, the file left whole", () => {
    const dir = folder();
    const file = join(dir, "a.json");
    writeFileSync(file, "old");
    mkdirSync(`${file}.tmp`);
    expect(replaceFile(file, "new")).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("old");
  });

  it("says false when the rename fails, and leaves no temporary", () => {
    const dir = folder();
    const file = join(dir, "a.json");
    mkdirSync(file);
    writeFileSync(join(file, "in-the-way"), "");
    expect(replaceFile(file, "new")).toBe(false);
    expect(readdirSync(dir)).toEqual(["a.json"]);
  });
});
