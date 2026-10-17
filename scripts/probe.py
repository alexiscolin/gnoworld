"""probe.py: the gate refuses what the harness promises to refuse (ADR-0002 §9).

Each case plants one known fault in a throwaway file, runs the tool that must catch it, and
checks the tool names the expected rule. A clean file must pass, so a tool that refuses
everything fails too. Planted files live in packages/core/src/__probe__/ (so the folder
rules apply) or in a temporary folder, and are removed afterwards.
Usage: scripts/probe.py, from the repository root, with Node and pnpm on PATH."""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = "packages/core/src/__probe__"
LONG = "export function long(): number {\n  let n = 0;\n" + "  n += 1;\n" * 85 + "  return n;\n}\n"
BLOCK = "".join(f"  total += values[{i}] * {i + 1};\n" for i in range(14))

# File name, content, the ESLint rule that must report it (None: no report at all).
LINT = [
    ("clean.ts", "export function twice(n: number): number {\n  return n * 2;\n}\n", None),
    ("forbidden_import.ts", 'import { readFileSync } from "node:fs";\n\nexport function read(p: string): string {\n  return readFileSync(p, "utf8");\n}\n', "no-restricted-imports"),
    ("cycle_a.ts", 'import { b } from "./cycle_b.ts";\n\nexport function a(): number {\n  return b() + 1;\n}\n', "import-x/no-cycle"),
    ("cycle_b.ts", 'import { a } from "./cycle_a.ts";\n\nexport function b(): number {\n  return a() + 1;\n}\n', "import-x/no-cycle"),
    ("empty_catch.ts", "export function run(g: () => void): void {\n  try {\n    g();\n  } catch {}\n}\n", "no-empty"),
    ("log_catch.ts", "declare const logger: { error: (e: unknown) => void };\n\nexport function run(g: () => void): void {\n  try {\n    g();\n  } catch (e) {\n    logger.error(e);\n  }\n}\n", "no-restricted-syntax"),
    ("no_cause.ts", 'export function run(g: () => void): void {\n  try {\n    g();\n  } catch (e) {\n    throw new Error("run failed");\n  }\n}\n', "preserve-caught-error"),
    ("floating.ts", "async function save(): Promise<void> {}\n\nexport function run(): void {\n  save();\n}\n", "@typescript-eslint/no-floating-promises"),
    ("switch.ts", 'type Kind = "a" | "b";\n\nexport function code(k: Kind): number {\n  switch (k) {\n    case "a":\n      return 1;\n  }\n  return 0;\n}\n', "@typescript-eslint/switch-exhaustiveness-check"),
    ("clock.ts", "export function now(): number {\n  return Date.now();\n}\n", "no-restricted-properties"),
    ("long.ts", LONG, "max-lines-per-function"),
    ("eval.ts", "export function run(code: string): unknown {\n  return eval(code);\n}\n", "no-eval"),
    ("important.css", ".a {\n  color: var(--color-text) !important;\n}\n", "css/no-important"),
]


def run(cmd, cwd="."):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def plant(files, where=HERE):
    os.makedirs(where, exist_ok=True)
    for name, content in files.items():
        with open(os.path.join(where, name), "w") as f:
            f.write(content)


failures = []


def expect(ok, what):
    print(("ok    " if ok else "FAIL  ") + what)
    if not ok:
        failures.append(what)


try:
    # ESLint: one run over every planted file, then each file must carry its rule.
    plant({name: content for name, content, _ in LINT})
    out = run(["pnpm", "exec", "eslint", "--no-cache", "--format", "json", HERE])
    try:
        report = {os.path.basename(r["filePath"]): {m.get("ruleId") for m in r["messages"]} for r in json.loads(out.stdout)}
    except ValueError:
        report = {}
        expect(False, "eslint ran: " + (out.stderr or out.stdout)[-300:])
    for name, _, rule in LINT:
        got = report.get(name, set())
        expect(got == set() if rule is None else rule in got, f"eslint {name}: expected {rule or 'nothing'}, got {sorted(map(str, got))}")
    shutil.rmtree(HERE)

    # Prettier: a file that is not formatted.
    plant({"messy.ts": "export const  a={b:1,\n c :2}\n"})
    out = run(["pnpm", "exec", "prettier", "--check", HERE])
    expect(out.returncode != 0 and "messy.ts" in out.stdout + out.stderr, "prettier refuses an unformatted file")
    shutil.rmtree(HERE)

    # knip: a file nothing imports.
    plant({"unused.ts": "export function lonely(): number {\n  return 1;\n}\n"})
    out = run(["pnpm", "exec", "knip", "--no-progress"])
    expect(out.returncode != 0 and "__probe__/unused.ts" in out.stdout, "knip reports an unused file")
    shutil.rmtree(HERE)

    # jscpd: the same block in two files.
    plant({f"copy_{x}.ts": f"export function sum_{x}(values: number[]): number {{\n  let total = 0;\n{BLOCK}  return total;\n}}\n" for x in "ab"})
    out = run(["pnpm", "exec", "jscpd", HERE])
    expect(out.returncode != 0, "jscpd refuses a copied block")
    shutil.rmtree(HERE)

    # clones: the same function with every name changed, which jscpd cannot see.
    shape = "export function {f}({v}: number[]): number {{\n  let {t} = 0;\n  for (const {x} of {v}) {{\n    if ({x} > 10) {{\n      {t} += {x} * 2;\n    }} else {{\n      {t} -= {x};\n    }}\n  }}\n  return {t};\n}}\n"
    plant({"one.ts": shape.format(f="alpha", v="values", t="total", x="v"), "two.ts": shape.format(f="beta", v="items", t="acc", x="item")})
    out = run(["node", "scripts/clones.mjs", HERE])
    expect(out.returncode != 0 and "one.ts" in out.stdout + out.stderr, "clones refuses a renamed copy")
    plant({"two.ts": shape.replace("* 2", "* 3").replace("-= ", "+= ").format(f="beta", v="items", t="acc", x="item").replace("> 10", ">= 10 && item < 99")})
    out = run(["node", "scripts/clones.mjs", HERE])
    expect(out.returncode == 0, "clones lets a function of another shape pass")
    shutil.rmtree(HERE)

    # check_comments: short comments, and none of the kinds that rot.
    body = "export function f(): number {\n  NOTE\n  return 1;\n}\n".replace
    comment_cases = {
        "a short header and a short note": ("// The file says what it is.\n" + body("NOTE", "// Why: the chain counts from one."), None),
        "a note over three lines": (body("NOTE", "// one\n  // two\n  // three\n  // four"), "longer than 3 lines"),
        "a header over six lines": ("".join(f"// line {i}\n" for i in range(7)) + body("NOTE", ""), "header longer than 6 lines"),
        "a TODO": (body("NOTE", "// TODO: later"), "todo"),
        "a banner": (body("NOTE", "// ==========="), "banner"),
        "numbered steps": (body("NOTE", "// 1. read the line"), "numbered step"),
        "an emoji": (body("NOTE", "// works 🚀"), "emoji"),
    }
    folder = tempfile.mkdtemp()
    for case, (content, word) in comment_cases.items():
        with open(os.path.join(folder, "f.ts"), "w") as f:
            f.write(content)
        out = run([sys.executable, "-I", "scripts/check_comments.py", folder])
        said = (out.stdout + out.stderr).lower()
        expect(out.returncode == 0 if word is None else out.returncode != 0 and word in said, f"check_comments {case}")
    shutil.rmtree(folder)

    # check_css: in a folder of its own, with its own tokens.
    css = tempfile.mkdtemp()
    tokens = ":root {\n  --space-2: 0.5rem;\n  --color-text: #eee;\n  --radius-m: 8px;\n}\n"
    use = lambda *names: "import styles from './Card.module.css';\n" + "".join(f"export const {n} = styles.{n};\n" for n in names)
    card = ".card {{\n{}}}\n".format
    ok_decls = "  padding: var(--space-2);\n  color: var(--color-text);\n  border-radius: var(--radius-m);\n"
    cases = {
        "clean": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card")}, None),
        "a layout exception with its reason": ({"Card.module.css": card(ok_decls + "  /* layout: an icon beside its label */ display: inline-flex;\n"), "Card.tsx": use("card")}, None),
        "layout in a block": ({"Card.module.css": card(ok_decls + "  display: flex;\n  gap: var(--space-2);\n"), "Card.tsx": use("card")}, "layout"),
        "a raw value": ({"Card.module.css": card(ok_decls + "  outline-color: #fff;\n"), "Card.tsx": use("card")}, "raw value"),
        "an unknown token": ({"Card.module.css": card(ok_decls + "  background: var(--color-txt);\n"), "Card.tsx": use("card")}, "unknown token"),
        "an unused token": ({"Card.module.css": card("  padding: var(--space-2);\n  color: var(--color-text);\n"), "Card.tsx": use("card")}, "unused token"),
        "an unused class": ({"Card.module.css": card(ok_decls) + ".extra {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card")}, "unused class"),
        "copied rules": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card"), "Tile.module.css": ".tile {\n" + ok_decls + "}\n", "Tile.tsx": "import styles from './Tile.module.css';\nexport const tile = styles.tile;\n"}, "copied"),
    }
    for case, (files, word) in cases.items():
        root = os.path.join(css, case.replace(" ", "_"))
        plant({"tokens.css": tokens, **files}, where=os.path.join(root, "ui"))
        out = run([sys.executable, "-I", "scripts/check_css.py", root])
        said = (out.stdout + out.stderr).lower()
        expect(out.returncode == 0 if word is None else out.returncode != 0 and word in said, f"check_css {case}")
    shutil.rmtree(css)
finally:
    shutil.rmtree(HERE, ignore_errors=True)

if failures:
    sys.exit(f"probe: {len(failures)} of the harness's promises do not hold")
print("probe: every planted fault was caught")
