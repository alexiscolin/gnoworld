// clones.mjs: renamed copies, which jscpd cannot see (docs/ARCHITECTURE.md, "Copies").
// Each function's syntax tree is written as a shape, every name and literal replaced by a
// placeholder; two functions of the same shape are a copy, whatever their names. It uses
// the TypeScript compiler the repo already installs. scripts/probe.py plants a case.
// Usage: node scripts/clones.mjs [folder…] (default: the workspaces that exist).
// ponytail: exact shapes only; near copies (a line added) are left to review.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const MIN_NODES = 40; // smaller functions are idioms, not copies
const PLACEHOLDERS = new Map([
  [ts.SyntaxKind.Identifier, "I"],
  [ts.SyntaxKind.PrivateIdentifier, "I"],
  [ts.SyntaxKind.NumericLiteral, "L"],
  [ts.SyntaxKind.BigIntLiteral, "L"],
  [ts.SyntaxKind.StringLiteral, "L"],
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral, "L"],
  [ts.SyntaxKind.RegularExpressionLiteral, "L"],
]);

function shape(node, count) {
  count.n++;
  const own = PLACEHOLDERS.get(node.kind) ?? String(node.kind);
  const parts = [];
  ts.forEachChild(node, (child) => void parts.push(shape(child, count)));
  return parts.length === 0 ? own : `${own}(${parts.join(",")})`;
}

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") yield* sources(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield path;
  }
}

const folders =
  process.argv.length > 2 ? process.argv.slice(2) : ["packages", "app", "admin", "server"].filter(existsSync);
const seen = new Map();
for (const path of folders.flatMap((f) => [...sources(f)])) {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isFunctionLike(node) && "body" in node && node.body) {
      const count = { n: 0 };
      const key = shape(node, count);
      if (count.n >= MIN_NODES) {
        const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        seen.set(key, [...(seen.get(key) ?? []), `${path}:${line} ${node.name?.getText() ?? "(anonymous)"}`]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

const copies = [...seen.values()].filter((places) => places.length > 1);
for (const places of copies) console.error(`clones: the same function, renamed:\n  ${places.join("\n  ")}`);
process.exit(copies.length === 0 ? 0 : 1);
