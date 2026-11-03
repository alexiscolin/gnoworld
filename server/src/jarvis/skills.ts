// Jarvis's skills (ADR-0002 §5), read once at start from one folder, as text only: each entry a skill's folder holding
// SKILL.md, optionally references/ of .md files, and a LICENSE and a NOTICE (D50); each a regular file, never a link
// (lstat), within a size and all within another, UTF-8 with no hidden or control character; SKILL.md's front matter
// exactly a name, the folder's, and a description, read by a pattern. Anything else stops the start, naming the file
// and why. It gives the index the system prompt lists, the tool load_skill, and the digest of every file (D51).
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, type Stats } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

interface Limits {
  readonly file: number;
  readonly total: number;
}

interface Skill {
  readonly name: string;
  readonly description: string;
  readonly references: readonly string[];
}

// The folder as the walk reads it, each path from its root.
interface Folder {
  // An entry's lstat, refused when it is a link: a symbolic one, or a file with a second name.
  stat(path: string): Stats;
  // A directory's entries, by their names' code units.
  list(path: string): string[];
  // A file's text, checked, read and kept.
  read(path: string, stats: Stats): string;
}

const failure = (path: string, why: string) => new Error(`skills: ${path}: ${why}`);

/** The skills of a folder, 64 KiB a file and 512 KiB in all by default; throws on anything else, naming the file. */
export function loadSkills(folder: string, limits: Limits = { file: 64 * 1024, total: 512 * 1024 }) {
  if (!lstatSync(folder).isDirectory()) throw new Error("skills: the folder is no directory");
  const files = new Map<string, { readonly bytes: Buffer; readonly text: string }>();
  let total = 0;
  const walk: Folder = {
    stat(path) {
      const stats = lstatSync(join(folder, path));
      if (stats.isSymbolicLink() || (stats.isFile() && stats.nlink > 1)) throw failure(path, "a link");
      return stats;
    },
    list: (path) => readdirSync(join(folder, path)).sort(),
    read(path, stats) {
      if (stats.size > limits.file) throw failure(path, `past ${String(limits.file)} bytes`);
      total += stats.size;
      if (total > limits.total) throw failure(path, `past ${String(limits.total)} bytes in all`);
      const bytes = readFileSync(join(folder, path));
      const text = textOf(path, bytes);
      files.set(path, { bytes, text });
      return text;
    },
  };
  const skills = walk.list("").map((name) => skillOf(walk, name));
  const [first, ...rest] = skills.map((skill) => skill.name);
  if (first === undefined) throw new Error("skills: no skill");
  const references = [...new Set(skills.flatMap((skill) => skill.references))].sort();
  const hash = createHash("sha256");
  // By the paths' code units, never a locale's, each framed by its path and length (paths are unique).
  for (const [path, { bytes }] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    hash.update(`${path}\0${String(bytes.length)}\0`).update(bytes);
  }
  return {
    index: skills.map(({ name, description }) => ({ name, description })),
    tool: toolOf([first, ...rest], references, (path) => files.has(path)),
    /** A skill's SKILL.md, or one of its references; throws for one that was not loaded. */
    read({ skill, reference }: { readonly skill: string; readonly reference?: string | undefined }): string {
      const path = reference === undefined ? `${skill}/SKILL.md` : `${skill}/references/${reference}`;
      const file = files.get(path);
      if (file === undefined) throw new Error(`skills: ${path} was not loaded`);
      return file.text;
    },
    digest: hash.digest("hex"),
  };
}

function skillOf(folder: Folder, name: string): Skill {
  if (!folder.stat(name).isDirectory()) throw failure(name, "not a skill's folder");
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw failure(name, "not a skill's name");
  let description: string | undefined;
  let references: readonly string[] = [];
  for (const entry of folder.list(name)) {
    const path = `${name}/${entry}`;
    const stats = folder.stat(path);
    if (entry === "references") references = referencesOf(folder, path, stats);
    else if (entry === "SKILL.md") description = descriptionOf(name, path, fileOf(folder, path, stats));
    else if (entry === "LICENSE" || entry === "NOTICE") fileOf(folder, path, stats);
    else throw failure(path, "not a skill's file");
  }
  if (description === undefined) throw failure(name, "no SKILL.md");
  return { name, description, references };
}

function referencesOf(folder: Folder, path: string, stats: Stats): string[] {
  if (!stats.isDirectory()) throw failure(path, "not a directory");
  return folder.list(path).map((entry) => {
    const file = `${path}/${entry}`;
    const entryStats = folder.stat(file);
    if (!entryStats.isFile() || !/^[a-z][a-z0-9_-]{0,63}\.md$/.test(entry)) throw failure(file, "not a reference");
    folder.read(file, entryStats);
    return entry;
  });
}

function fileOf(folder: Folder, path: string, stats: Stats): string {
  if (!stats.isFile()) throw failure(path, "not a file");
  return folder.read(path, stats);
}

// UTF-8 whose byte order mark is kept, so it is refused with the rest: scripts/hidden.py's set, without its emoji
// exception, and every control character but tab and new line.
function textOf(path: string, bytes: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`skills: ${path}: not UTF-8 text`, { cause });
  }
  const hidden = /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Zl}\p{Zp}]|[^\P{Cc}\t\n]/u.exec(text)?.[0];
  if (hidden !== undefined) {
    const point = Number(hidden.codePointAt(0)).toString(16).toUpperCase().padStart(4, "0");
    throw failure(path, `holds U+${point}, a hidden or control character`);
  }
  return text;
}

function descriptionOf(name: string, path: string, text: string): string {
  const front = /^---\nname: ([a-z][a-z0-9-]{0,63})\ndescription: (\S[^\n]{0,1023})\n---\n/.exec(text);
  const description = front?.[2];
  if (description === undefined) throw failure(path, "its front matter is not exactly a name and a description");
  if (front?.[1] !== name) throw failure(path, "its name is not its folder's");
  return description;
}

// load_skill: a skill by its name, or one of its references by its file's name, both from what was loaded.
function toolOf(names: [string, ...string[]], references: readonly string[], loaded: (path: string) => boolean) {
  const description = "Gives the text of one of the skills the instructions list, or of one of its references.";
  const skill = z.enum(names).describe("The skill's name.");
  const [first, ...rest] = references;
  if (first === undefined) return { name: "load_skill" as const, description, args: z.strictObject({ skill }) };
  const reference = z
    .enum([first, ...rest])
    .optional()
    .describe("One of that skill's references, by its file's name.");
  const args = z.strictObject({ skill, reference }).superRefine((value, context) => {
    if (value.reference !== undefined && !loaded(`${value.skill}/references/${value.reference}`)) {
      context.addIssue({ code: "custom", message: "not one of that skill's references" });
    }
  });
  return { name: "load_skill" as const, description, args };
}
