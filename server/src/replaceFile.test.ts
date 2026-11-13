import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { lastFile, replaceFile, replaceFiles } from "./replaceFile.ts";

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

// Two files that go together (7n2: the worlds and their count): both temporaries are written before either is renamed, so a reader never
// gets a new one beside an old one for want of room or of rights. Only a rename that fails after the first went can part them.
describe("replaceFiles", () => {
  it("writes every file, each readable by others, and leaves nothing beside them", () => {
    const dir = folder();
    const files = [
      { file: join(dir, "a.json"), text: "a" },
      { file: join(dir, "b.json"), text: "b" },
    ];
    expect(replaceFiles(files)).toBe(true);
    expect(files.map(({ file }) => readFileSync(file, "utf8"))).toEqual(["a", "b"]);
    expect(files.map(({ file }) => statSync(file).mode & 0o777)).toEqual([0o644, 0o644]);
    expect(readdirSync(dir).sort()).toEqual(["a.json", "b.json"]);
  });

  it("replaces none when a later temporary cannot be written: the first file keeps its old text, and no temporary stays", () => {
    const dir = folder();
    const first = join(dir, "a.json");
    const second = join(dir, "b.json");
    writeFileSync(first, "old a");
    writeFileSync(second, "old b");
    mkdirSync(`${second}.tmp`);
    expect(
      replaceFiles([
        { file: first, text: "new a" },
        { file: second, text: "new b" },
      ]),
    ).toBe(false);
    expect(readFileSync(first, "utf8")).toBe("old a");
    expect(readFileSync(second, "utf8")).toBe("old b");
    expect(readdirSync(dir).sort()).toEqual(["a.json", "b.json", "b.json.tmp"]);
    expect(readdirSync(`${second}.tmp`)).toEqual([]);
  });

  it("replaces none when the first temporary cannot be written, and writes no later one", () => {
    const dir = folder();
    const first = join(dir, "a.json");
    const second = join(dir, "b.json");
    mkdirSync(`${first}.tmp`);
    expect(
      replaceFiles([
        { file: first, text: "new a" },
        { file: second, text: "new b" },
      ]),
    ).toBe(false);
    expect(readdirSync(dir).sort()).toEqual(["a.json.tmp"]);
  });

  it("says false when the first rename fails, replaces no later file, and leaves no temporary", () => {
    const dir = folder();
    const first = join(dir, "a.json");
    const second = join(dir, "b.json");
    mkdirSync(first);
    writeFileSync(join(first, "in-the-way"), "");
    writeFileSync(second, "old b");
    expect(
      replaceFiles([
        { file: first, text: "new a" },
        { file: second, text: "new b" },
      ]),
    ).toBe(false);
    expect(readFileSync(second, "utf8")).toBe("old b");
    expect(readdirSync(dir).sort()).toEqual(["a.json", "b.json"]);
  });

  it("says false when a later rename fails, and leaves no temporary of it", () => {
    const dir = folder();
    const first = join(dir, "a.json");
    const second = join(dir, "b.json");
    mkdirSync(second);
    writeFileSync(join(second, "in-the-way"), "");
    expect(
      replaceFiles([
        { file: first, text: "new a" },
        { file: second, text: "new b" },
      ]),
    ).toBe(false);
    expect(readFileSync(first, "utf8")).toBe("new a");
    expect(readdirSync(dir).sort()).toEqual(["a.json", "b.json"]);
  });
});

describe("lastFile", () => {
  const Shape = z.object({ n: z.number() });

  it("gives the file through its schema", () => {
    const file = join(folder(), "a.json");
    writeFileSync(file, '{"n":3}');
    expect(lastFile(file, Shape)).toEqual({ n: 3 });
  });

  it("gives none for a file missing, past its cap, not JSON, or refused by its schema", () => {
    const dir = folder();
    const write = (name: string, text: string): string => {
      writeFileSync(join(dir, name), text);
      return join(dir, name);
    };
    expect(lastFile(join(dir, "none.json"), Shape)).toBeUndefined();
    expect(lastFile(write("big.json", `{"n":${"1".repeat(20)}}`), Shape, 10)).toBeUndefined();
    expect(lastFile(write("broken.json", "{"), Shape)).toBeUndefined();
    expect(lastFile(write("other.json", '{"n":"3"}'), Shape)).toBeUndefined();
    expect(lastFile(write("small.json", '{"n":3}'), Shape, 7)).toEqual({ n: 3 });
  });
});
