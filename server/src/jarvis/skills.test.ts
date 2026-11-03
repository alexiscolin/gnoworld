import { createHash } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { logger } from "../log.ts";
import { allowlist } from "./allowlist.ts";
import { loadSkills } from "./skills.ts";

const base = mkdtempSync(join(tmpdir(), "gnoworld-skills-"));
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});
let made = 0;
// A skills folder of its own for each test: each path's bytes, its folders made on the way.
const folder = (files: Record<string, string | Uint8Array>): string => {
  made += 1;
  const root = join(base, `case-${String(made)}`);
  mkdirSync(root);
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }
  return root;
};
const skill = (name: string, description = `What ${name} is for.`, body = "Plain words.\n") =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
const TWO = () => ({
  "concierge/SKILL.md": skill("concierge"),
  "gno/SKILL.md": skill("gno", "How to read a realm."),
  "gno/references/security.md": "# Security\n",
  "gno/references/audit.md": "# Audit\n",
  "gno/LICENSE": "Apache License\n",
  "gno/NOTICE": "From gnomcp.\n",
});
// TWO's files but one.
const without = (path: string) => Object.fromEntries(Object.entries(TWO()).filter(([name]) => name !== path));
const failure = (root: string, limits?: { file: number; total: number }): string => {
  try {
    loadSkills(root, limits);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("loadSkills accepted the folder");
};
const checked = (root: string) =>
  allowlist(
    [loadSkills(root).tool],
    logger("p".repeat(40), () => undefined),
  );

describe("loadSkills: what it gives", () => {
  it("lists each skill's name and description, by name, and reads a skill or one of its references", () => {
    const skills = loadSkills(folder(TWO()));
    expect(skills.index).toEqual([
      { name: "concierge", description: "What concierge is for." },
      { name: "gno", description: "How to read a realm." },
    ]);
    expect(skills.read({ skill: "gno" })).toBe(skill("gno", "How to read a realm."));
    expect(skills.read({ skill: "gno", reference: "audit.md" })).toBe("# Audit\n");
    expect(skills.read({ skill: "concierge" })).toBe(skill("concierge"));
  });

  it("reads every file once, at start: what it gives holds after the folder is gone", () => {
    const root = folder(TWO());
    const skills = loadSkills(root);
    rmSync(root, { recursive: true });
    expect(skills.read({ skill: "gno", reference: "security.md" })).toBe("# Security\n");
  });

  it("throws when read for a skill, or a skill's reference, that it did not load", () => {
    const skills = loadSkills(folder(TWO()));
    expect(() => skills.read({ skill: "translation" })).toThrow("skills: translation/SKILL.md was not loaded");
    expect(() => skills.read({ skill: "concierge", reference: "audit.md" })).toThrow(
      "skills: concierge/references/audit.md was not loaded",
    );
  });

  it("defines load_skill, its skill and reference each one of what was loaded", () => {
    const { tool } = loadSkills(folder(TWO()));
    expect(tool.name).toBe("load_skill");
    expect(z.toJSONSchema(tool.args, { io: "input" })).toMatchObject({
      properties: { skill: { enum: ["concierge", "gno"] }, reference: { enum: ["audit.md", "security.md"] } },
      required: ["skill"],
      additionalProperties: false,
    });
  });

  it("describes load_skill and each of its fields", () => {
    const { tool } = loadSkills(folder(TWO()));
    expect(tool.description).toMatch(/skills/);
    const Fields = z.object({ properties: z.record(z.string(), z.object({ description: z.string().min(1) })) });
    expect(Object.keys(Fields.parse(z.toJSONSchema(tool.args)).properties)).toEqual(["skill", "reference"]);
  });

  it("offers each reference once, by its name's code units, whichever skill holds it", () => {
    const files = {
      "a/SKILL.md": skill("a"),
      "a/references/zeta.md": "# Zeta\n",
      "a/references/notes.md": "# A's notes\n",
      "b/SKILL.md": skill("b"),
      "b/references/mid.md": "# Mid\n",
      "b/references/notes.md": "# B's notes\n",
    };
    const { tool } = loadSkills(folder(files));
    expect(z.toJSONSchema(tool.args, { io: "input" })).toMatchObject({
      properties: { reference: { enum: ["mid.md", "notes.md", "zeta.md"] } },
    });
  });

  it("has no reference to offer when no skill has one", () => {
    const { tool } = loadSkills(folder({ "concierge/SKILL.md": skill("concierge") }));
    expect(z.toJSONSchema(tool.args, { io: "input" })).toMatchObject({
      properties: { skill: { enum: ["concierge"] } },
    });
    expect(
      Object.keys(
        z.object({ properties: z.record(z.string(), z.unknown()) }).parse(z.toJSONSchema(tool.args)).properties,
      ),
    ).toEqual(["skill"]);
  });

  it.each([
    ["a skill", { skill: "concierge" }, true],
    ["a skill's reference", { skill: "gno", reference: "security.md" }, true],
    ["another skill's reference", { skill: "concierge", reference: "security.md" }, false],
    ["a skill not loaded", { skill: "translation" }, false],
    ["a path out of the folder", { skill: "../gno" }, false],
    ["a reference out of the folder", { skill: "gno", reference: "../../../etc/passwd" }, false],
    ["the licence, which is no reference", { skill: "gno", reference: "LICENSE" }, false],
    ["an extra field", { skill: "gno", path: "references/audit.md" }, false],
    ["no skill", { reference: "audit.md" }, false],
  ])("checks load_skill's arguments: %s", (_case, args, ok) => {
    expect(checked(folder(TWO())).check("load_skill", args).ok).toBe(ok);
  });
});

describe("loadSkills: its digest", () => {
  it("is the SHA-256 of every file, the same however the folder was written", () => {
    const files = TWO();
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    const first = loadSkills(folder(files)).digest;
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(loadSkills(folder(reversed)).digest).toBe(first);
  });

  it.each(["concierge/SKILL.md", "gno/SKILL.md", "gno/references/audit.md", "gno/LICENSE", "gno/NOTICE"])(
    "changes with one byte of %s",
    (path) => {
      const files: Record<string, string> = TWO();
      const before = loadSkills(folder(files)).digest;
      files[path] = `${files[path] ?? ""}x`;
      expect(loadSkills(folder(files)).digest).not.toBe(before);
    },
  );

  it("changes when a byte moves from one file to the next, the total kept", () => {
    const files: Record<string, string> = TWO();
    const before = loadSkills(folder(files)).digest;
    files["gno/references/audit.md"] = "# Audit\n#";
    files["gno/references/security.md"] = " Security\n";
    expect(loadSkills(folder(files)).digest).not.toBe(before);
  });

  it("changes when a file is renamed, its bytes kept", () => {
    const root = folder(TWO());
    const before = loadSkills(root).digest;
    renameSync(join(root, "gno/references/audit.md"), join(root, "gno/references/audits.md"));
    expect(loadSkills(root).digest).not.toBe(before);
  });

  // A known answer, so a Mac and a Linux image agree: the files by their paths' code units (`a-b/` before `a/`, which the
  // walk reads first, and `LICENSE` before `references/`, where a locale's order differs), each its path, a NUL, its
  // length in bytes in decimal, a NUL, then its bytes. Computed apart, with Python's hashlib.
  it("is the known SHA-256 of a fixed folder", () => {
    const root = folder({
      "ab/references/x.md": "X\n",
      "ab/NOTICE": "N\n",
      "ab/SKILL.md": "---\nname: ab\ndescription: B.\n---\n",
      "ab/LICENSE": "L\n",
      "a-b/SKILL.md": "---\nname: a-b\ndescription: A.\n---\n",
      "a/SKILL.md": "---\nname: a\ndescription: C.\n---\n",
    });
    expect(loadSkills(root).digest).toBe("29d3834c2bb7353576276a5f40e96317882299564582248e7b87d6219234e53d");
  });
});

describe("loadSkills: a planted skill stops the start, naming the file and why", () => {
  it.each([
    ["concierge/SKILL.md", "SKILL.md"],
    ["gno/references/audit.md", "audit.md"],
    ["gno/LICENSE", "LICENSE"],
  ])("refuses %s as a symbolic link to a file outside", (path) => {
    const outside = join(base, `outside-${String(made)}.txt`);
    writeFileSync(outside, TWO()[path as keyof ReturnType<typeof TWO>]);
    const root = folder(without(path));
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(outside, join(root, path));
    expect(failure(root)).toBe(`skills: ${path}: a link`);
  });

  it("refuses a skill's folder, or its references, as a symbolic link", () => {
    const real = folder(TWO());
    const root = folder({});
    symlinkSync(join(real, "gno"), join(root, "gno"));
    expect(failure(root)).toBe("skills: gno: a link");
    const other = folder({ "gno/SKILL.md": skill("gno") });
    symlinkSync(join(real, "gno/references"), join(other, "gno/references"));
    expect(failure(other)).toBe("skills: gno/references: a link");
  });

  it("refuses a file with a second name, a hard link", () => {
    const root = folder(TWO());
    linkSync(join(root, "gno/references/audit.md"), join(base, `hard-${String(made)}.md`));
    expect(failure(root)).toBe("skills: gno/references/audit.md: a link");
  });

  it("refuses the folder itself as a symbolic link", () => {
    const real = folder(TWO());
    const link = join(base, `link-${String(made)}`);
    symlinkSync(real, link);
    expect(failure(link)).toBe("skills: the folder is no directory");
    expect(failure(join(real, "concierge/SKILL.md"))).toBe("skills: the folder is no directory");
  });

  it.each([
    ["concierge/run.sh", "echo planted\n", "concierge/run.sh: not a skill's file"],
    ["translation/skill.md", skill("translation"), "translation/skill.md: not a skill's file"],
    ["concierge/scripts/run.md", "# Run\n", "concierge/scripts: not a skill's file"],
    ["gno/references/run.sh", "echo planted\n", "gno/references/run.sh: not a reference"],
    ["gno/references/notes.md.sh", "echo planted\n", "gno/references/notes.md.sh: not a reference"],
    ["gno/references/notes.mdx", "# Notes\n", "gno/references/notes.mdx: not a reference"],
    ["gno/references/deep/more.md", "# More\n", "gno/references/deep: not a reference"],
    ["gno/references/Notes.md", "# Notes\n", "gno/references/Notes.md: not a reference"],
    ["gno/references/..md", "# Up\n", "gno/references/..md: not a reference"],
    ["gno/references/.hidden.md", "# Hidden\n", "gno/references/.hidden.md: not a reference"],
    ["README.md", "# Skills\n", "README.md: not a skill's folder"],
    ["..concierge/SKILL.md", skill("..concierge"), "..concierge: not a skill's name"],
    ["Translation/SKILL.md", skill("Translation"), "Translation: not a skill's name"],
    ["1st/SKILL.md", skill("1st"), "1st: not a skill's name"],
    ["a_b/SKILL.md", skill("a_b"), "a_b: not a skill's name"],
    ["a.b/SKILL.md", skill("a.b"), "a.b: not a skill's name"],
    [`a${"b".repeat(64)}/SKILL.md`, skill("x"), `a${"b".repeat(64)}: not a skill's name`],
    [".DS_Store/SKILL.md", skill("x"), ".DS_Store: not a skill's name"],
  ])("refuses %s", (path, bytes, why) => {
    expect(failure(folder({ ...TWO(), [path]: bytes }))).toBe(`skills: ${why}`);
  });

  it("refuses a skill with no SKILL.md, a SKILL.md that is a folder, and references that are a file", () => {
    expect(failure(folder({ ...TWO(), "realm-reader/references/a.md": "# A\n" }))).toBe(
      "skills: realm-reader: no SKILL.md",
    );
    expect(failure(folder({ ...TWO(), "realm-reader/SKILL.md/a.md": "# A\n" }))).toBe(
      "skills: realm-reader/SKILL.md: not a file",
    );
    expect(
      failure(folder({ ...TWO(), "realm-reader/SKILL.md": skill("realm-reader"), "realm-reader/references": "x" })),
    ).toBe("skills: realm-reader/references: not a directory");
  });

  it("refuses a folder with no skill", () => {
    expect(failure(folder({}))).toBe("skills: no skill");
  });

  it.each([
    ["another field", "---\nname: concierge\ndescription: Where to go.\nallowed-tools: Bash\n---\n"],
    ["a field first", "---\ndescription: Where to go.\nname: concierge\n---\n"],
    ["no front matter", "# Concierge\n"],
    ["no closing line", "---\nname: concierge\ndescription: Where to go.\n"],
    ["an empty description", "---\nname: concierge\ndescription: \n---\n"],
    ["a description over 1024 characters", `---\nname: concierge\ndescription: ${"w".repeat(1025)}\n---\n`],
    ["a quoted YAML block", "---\nname: concierge\ndescription: |\n  Where to go.\n---\n"],
    ["a blank line first", "\n---\nname: concierge\ndescription: Where to go.\n---\n"],
  ])("refuses a SKILL.md with %s", (_case, text) => {
    expect(failure(folder({ "concierge/SKILL.md": text }))).toBe(
      "skills: concierge/SKILL.md: its front matter is not exactly a name and a description",
    );
  });

  it("takes a description of 1024 characters", () => {
    const text = `---\nname: concierge\ndescription: ${"w".repeat(1024)}\n---\n`;
    expect(loadSkills(folder({ "concierge/SKILL.md": text })).index[0]?.description).toHaveLength(1024);
  });

  it("refuses a SKILL.md whose name is another's", () => {
    expect(failure(folder({ "concierge/SKILL.md": skill("gno") }))).toBe(
      "skills: concierge/SKILL.md: its name is not its folder's",
    );
  });

  it("refuses a file past its size, and files past their size in all, naming the file that passed it", () => {
    const limits = { file: 100, total: 250 };
    expect(failure(folder({ "concierge/SKILL.md": skill("concierge", "d".repeat(100)) }), limits)).toBe(
      "skills: concierge/SKILL.md: past 100 bytes",
    );
    const full = { "a/SKILL.md": skill("a", "d".repeat(50)), "b/SKILL.md": skill("b", "d".repeat(50)) };
    expect(loadSkills(folder(full), limits).index).toHaveLength(2);
    expect(failure(folder({ ...full, "c/SKILL.md": skill("c", "d".repeat(50)) }), limits)).toBe(
      "skills: c/SKILL.md: past 250 bytes in all",
    );
  });

  it("takes a file of exactly its size, and files of exactly their size in all", () => {
    const text = skill("a", "d".repeat(40));
    const size = Buffer.byteLength(text);
    expect(loadSkills(folder({ "a/SKILL.md": text }), { file: size, total: size }).index).toHaveLength(1);
  });

  it("holds 64 KiB a file and 512 KiB in all by default", () => {
    const big = (name: string) => skill(name, "d", "b".repeat(64 * 1024 - skill(name, "d", "").length));
    expect(loadSkills(folder({ "a/SKILL.md": big("a") })).index).toHaveLength(1);
    expect(failure(folder({ "a/SKILL.md": `${big("a")}b` }))).toBe("skills: a/SKILL.md: past 65536 bytes");
    const eight = Object.fromEntries(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((name) => [`${name}/SKILL.md`, big(name)]),
    );
    expect(loadSkills(folder(eight)).index).toHaveLength(8);
    expect(failure(folder({ ...eight, "i/SKILL.md": skill("i") }))).toBe(
      "skills: i/SKILL.md: past 524288 bytes in all",
    );
  });

  // scripts/hidden.py's set (Default_Ignorable_Code_Point, Cf, Zl, Zp), without its emoji exception, and every control
  // character but tab and new line: one of each class it holds, its unassigned tags included (F5083, F5086).
  const HIDDEN = [
    [0x202e, "a right-to-left override"],
    [0x2066, "a left-to-right isolate"],
    [0x2069, "a pop directional isolate"],
    [0x200b, "a zero-width space"],
    [0x00ad, "a soft hyphen"],
    [0x034f, "a combining grapheme joiner"],
    [0x115f, "a Hangul choseong filler"],
    [0x3164, "a Hangul filler"],
    [0xfeff, "a byte order mark"],
    [0xe0000, "an unassigned tag"],
    [0xe0002, "another unassigned tag"],
    [0xe0041, "a tag letter"],
    [0xfe0f, "a variation selector"],
    [0x2028, "a line separator"],
    [0x2029, "a paragraph separator"],
    [0x0000, "a NUL"],
    [0x000d, "a carriage return"],
    [0x001b, "an escape"],
    [0x007f, "a delete"],
    [0x0085, "a next line"],
  ] as const;
  // Each place a character can hide: SKILL.md's description, which the system prompt lists, its body, a reference,
  // the licence and the notice; at a file's very start too.
  const PLACES = [
    ["concierge/SKILL.md", (c: string) => skill("concierge", `Where${c} to go.`)],
    ["gno/SKILL.md", (c: string) => skill("gno", "How to read a realm.", `Plain${c} words.\n`)],
    ["gno/references/audit.md", (c: string) => `# Audit${c}\n`],
    ["gno/LICENSE", (c: string) => `Apache License${c}\n`],
    ["gno/NOTICE", (c: string) => `${c}From gnomcp.\n`],
  ] as const;
  it.each(HIDDEN)("refuses the code point %i, %s, wherever it is", (point) => {
    const named = `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
    for (const [path, holding] of PLACES) {
      const files = { ...TWO(), [path]: holding(String.fromCodePoint(point)) };
      expect(failure(folder(files))).toBe(`skills: ${path}: holds ${named}, a hidden or control character`);
    }
  });

  it("refuses a variation selector even after an emoji, which the repository's gate would keep", () => {
    const text = `# Audit ${String.fromCodePoint(0x1f534, 0xfe0f)}\n`;
    expect(failure(folder({ ...TWO(), "gno/references/audit.md": text }))).toBe(
      "skills: gno/references/audit.md: holds U+FE0F, a hidden or control character",
    );
  });

  it("takes tabs, new lines, accents, dashes, arrows, box drawing, a no-break space and emoji, as gnomcp's skill has", () => {
    const shown = [0xe9, 0x2014, 0x2192, 0x2500, 0x00a0, 0x2713, 0x1f534]
      .map((point) => String.fromCodePoint(point))
      .join(" ");
    const text = skill("a", `Caf${String.fromCodePoint(0xe9)} ${shown}`, `\tcode\n${shown}\n`);
    expect(loadSkills(folder({ "a/SKILL.md": text })).index).toHaveLength(1);
  });

  it("takes a skill named with a letter and up to 63 letters, digits and hyphens", () => {
    const name = `a${"b-9".repeat(21)}`;
    expect(loadSkills(folder({ [`${name}/SKILL.md`]: skill(name) })).index.map((entry) => entry.name)).toEqual([name]);
  });

  // No regular file, as a named pipe a read would wait on for ever: a folder in each place, as the sandbox can make no
  // pipe (Node has no mkfifo, and knip refuses a test that runs a binary no package lists) nor bind a socket (EPERM).
  it.each(["concierge/SKILL.md", "gno/references/audit.md", "gno/LICENSE", "gno/NOTICE"])(
    "refuses %s as no regular file",
    (path) => {
      const root = folder({ ...without(path), [`${path}/inside.md`]: "# Inside\n" });
      const why = path.includes("references/") ? "not a reference" : "not a file";
      expect(failure(root)).toBe(`skills: ${path}: ${why}`);
    },
  );

  it("refuses a file that is no UTF-8 text", () => {
    const files = { ...TWO(), "gno/references/audit.md": Uint8Array.from([0x23, 0x20, 0xff, 0x0a]) };
    expect(failure(folder(files))).toBe("skills: gno/references/audit.md: not UTF-8 text");
    // The decoder's own error rides along, for whoever reads the crash.
    let cause: unknown;
    try {
      loadSkills(folder(files));
    } catch (error) {
      cause = error instanceof Error ? error.cause : undefined;
    }
    expect(cause).toBeInstanceOf(TypeError);
    const surrogate = { ...TWO(), "gno/references/audit.md": Uint8Array.from([0xed, 0xa0, 0x80]) };
    expect(failure(folder(surrogate))).toBe("skills: gno/references/audit.md: not UTF-8 text");
  });
});

describe("loadSkills: the skills folder this repository ships", () => {
  const SHIPPED = fileURLToPath(new URL("../../jarvis/skills", import.meta.url));

  it("loads ours and gnomcp's gno skill, with its fourteen references", () => {
    const skills = loadSkills(SHIPPED);
    expect(skills.index.map((entry) => entry.name)).toEqual([
      "catch-up",
      "concierge",
      "gno",
      "realm-reader",
      "translation",
    ]);
    const schema = z.object({ properties: z.object({ reference: z.object({ enum: z.array(z.string()) }) }) });
    expect(schema.parse(z.toJSONSchema(skills.tool.args)).properties.reference.enum).toHaveLength(14);
  });

  it("keeps ours short: a description of 300 characters at most, a SKILL.md of 2 KiB at most", () => {
    const skills = loadSkills(SHIPPED);
    for (const { name, description } of skills.index.filter((entry) => entry.name !== "gno")) {
      expect(description.length).toBeLessThanOrEqual(300);
      expect(Buffer.byteLength(skills.read({ skill: name }))).toBeLessThanOrEqual(2048);
    }
  });

  it("ships gnomcp's gno skill unchanged, its licence beside it, and a notice naming its source, version and bytes", () => {
    const gno = join(SHIPPED, "gno");
    const notice = readFileSync(join(gno, "NOTICE"), "utf8");
    expect(notice).toContain("gnomcp 0.11.0");
    expect(notice).toContain("https://github.com/gnoverse/gno-mcp");
    expect(readFileSync(join(gno, "LICENSE"), "utf8")).toMatch(/^ +Apache License\n +Version 2\.0, January 2004\n/);
    // Each file's SHA-256 as gnomcp 0.11.0 ships it, which the notice lists: a change to one fails here.
    const listed = [...notice.matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gm)].map(([, hash, path]) => [path, hash]);
    const shipped = [
      "LICENSE",
      "SKILL.md",
      ...readdirSync(join(gno, "references")).map((name) => `references/${name}`),
    ];
    expect(listed.map(([path]) => path).sort()).toEqual(shipped.sort());
    for (const [path, hash] of listed) {
      expect(
        createHash("sha256")
          .update(readFileSync(join(gno, path ?? "")))
          .digest("hex"),
      ).toBe(hash);
    }
  });
});
