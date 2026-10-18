// check_comments.mjs: comments stay short and keep only what code cannot say (CLAUDE.md). The
// TypeScript parser finds them, so a "//" inside a string is no comment and one after code is.
// A file's header (past a shebang) is 6 lines at most, any other comment 3; no to-do marker,
// banner, numbered steps, emoji or escape hatch. scripts/probe.py plants each fault.
// Usage: node scripts/check_comments.mjs [root]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const CODE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const SKIP = new Set(["docs"]); // besides .gitignore: the frozen prototype's code
const RULES = [
  ["a TODO marker", /\b(TODO|FIXME|XXX|HACK)\b|@todo\b/i],
  ["a banner", /[-=*#~_─━═]{4,}/],
  ["a numbered step", /^\s*(\d+[.)]\s|step \d+\b)/im],
  ["an emoji", /(?![✓✔])[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}-\u{2B55}]/u],
  [
    "an escape hatch (eslint-disable, v8/c8/istanbul ignore, jscpd:ignore, Stryker disable)",
    /eslint-(disable|enable)|\b(v8|c8|istanbul) ignore\b|jscpd:ignore|Stryker (disable|restore)/i,
  ],
];
const LIMITS = { header: 6, other: 3 };

/** The files under dir, as paths from the root; node_modules and links are not entered. */
function walk(dir, prefix) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.isSymbolicLink()) return [];
    const path = prefix + entry.name;
    return entry.isDirectory() ? walk(join(dir, entry.name), `${path}/`) : [path];
  });
}

/** The files git would track under root, or every file when root is not in a repository. */
function listed(root) {
  let paths;
  try {
    paths = execFileSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    // Outside a repository (the pre-commit's staged copy holds only tracked files), skip what it
    // borrows: its links are never entered, as git lists a link, not what it points to.
    paths = walk(root, "");
  }
  return paths.filter(
    (p) =>
      !p.split("/").some((part) => SKIP.has(part)) && existsSync(join(root, p)) && statSync(join(root, p)).isFile(),
  );
}

/** Each comment of a file: its first line and its text, found by the TypeScript parser or, in CSS, by its delimiters. */
function comments(path, text) {
  if (extname(path) === ".css") {
    return [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => ({
      line: text.slice(0, m.index).split("\n").length,
      text: m[0],
    }));
  }
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const seen = new Map();
  const collect = (ranges) => {
    for (const r of ranges ?? [])
      seen.set(r.pos, { line: file.getLineAndCharacterOfPosition(r.pos).line + 1, text: text.slice(r.pos, r.end) });
  };
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(text, node.pos));
    collect(ts.getTrailingCommentRanges(text, node.end));
    node.forEachChild(visit);
  };
  visit(file);
  collect(ts.getLeadingCommentRanges(text, file.endOfFileToken.pos));
  return [...seen.values()].sort((a, b) => a.line - b.line);
}

/** The comment's words, without its delimiters; empty lines do not count toward its length. */
const content = (comment) =>
  comment.text
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^(\/\/+|\/\*+|\*+\/?|\*)/, "")
        .replace(/\*+\/$/, "")
        .trim(),
    )
    .filter(Boolean);

const root = process.argv[2] ?? ".";
const problems = [];
for (const path of listed(root).filter((p) => CODE.has(extname(p)) || extname(p) === ".css")) {
  const text = readFileSync(join(root, path), "utf8");
  const first = text.startsWith("#!") ? 2 : 1;
  const runs = [];
  for (const c of comments(path, text)) {
    for (const [what, rule] of RULES)
      if (rule.test(content(c).join("\n")))
        problems.push(`${relative(".", join(root, path))}:${c.line}: ${what} in a comment`);
    const last = runs.at(-1);
    const span = c.text.split("\n").length;
    if (last && c.text.startsWith("//") && last.lines.at(-1).startsWith("//") && c.line === last.end + 1) {
      last.lines.push(c.text);
      last.end = c.line;
    } else runs.push({ start: c.line, end: c.line + span - 1, lines: [c.text] });
  }
  for (const run of runs) {
    const header = run.start === first;
    const limit = header ? LIMITS.header : LIMITS.other;
    const length = run.lines.flatMap((t) => content({ text: t })).length;
    if (length > limit)
      problems.push(
        `${relative(".", join(root, path))}:${run.start}: ${header ? "header" : "comment"} longer than ${limit} lines (${length}); keep only what the code cannot say`,
      );
  }
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
