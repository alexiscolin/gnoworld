"""probe.py: the gate refuses what the harness promises to refuse (ADR-0002 §9).

Each case plants one known fault in a throwaway file, runs the tool that must catch it, and
checks the tool names the expected rule. A clean file must pass, so a tool that refuses
everything fails too. Planted files live in packages/core/src/__probe__/ (so the folder
rules apply) or in a temporary folder, and are removed afterwards.
Usage: scripts/probe.py, from the repository root, with Node and pnpm on PATH."""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; leave no __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves this folder off the path
from repo_files import BENCH_FILE

HERE = "packages/core/src/__probe__"
APP = "app/src/__probe__"
UI = "packages/ui/src/__probe__"
AVATAR = "packages/ui/src/Avatar/__probe__"
FIELD = "packages/ui/src/Field/__probe__"
SIZING = "@layer components {\n  .a {\n    field-sizing: content;\n  }\n}\n"
RESIZE = "@layer components {\n  .a {\n    resize: block;\n  }\n}\n"
FORCED = "@layer components {\n  .a {\n    forced-color-adjust: none;\n  }\n}\n"
LONG = "export function long(): number {\n  let n = 0;\n" + "  n += 1;\n" * 85 + "  return n;\n}\n"
with open("package.json") as f:
    SCRIPTS = json.load(f)["scripts"]  # the gate's own commands, so a case proves what the gate runs
BLOCK = "".join(f"  total += values[{i}] * {i + 1};\n" for i in range(14))
# The network and the device's storage, which the app reaches only from lib and the worker (F378).
# No state at a module's top in a workspace's source (F412): every test shares it, and StrykerJS ignores what builds it.
MODULE = "no-restricted-syntax: A Map, WeakMap or Set at a module's top"
# What runs on a frame makes nothing (ADR-0002 §9, backlog row 7): the collector's pause is a dropped frame.
FRAME = "no-restricted-syntax: Nothing is made on a frame"
REACHES = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "localStorage", "sessionStorage", "indexedDB", "caches", "cookieStore"]

# What the scene's loop reaches in core, planted in the two folders that hold it: every name of the rule, then each form.
FRAME_NAMES = ["tick", "wake", "reschedule", "cancel", "readRate", "draw", "sample", "advance", "follow", "march", "visit", "cellIn", "write", "light", "unit", "moodAt", "lattice", "field", "ringAt", "driftAt", "wrapTo", "nearestCell", "cellHash", "salted", "mix", "settle", "nextState", "unitOf", "smoothstep", "smootherstep", "frameRate", "isDue", "carryOver", "frameWait", "judgeFrames"]
FRAME_CORE = [
    *[(f"name_{name}.ts", f"export function {name}(): number[] {{\n  return [1];\n}}\n", FRAME) for name in FRAME_NAMES],
    ("frame_arrow.ts", "export const wrapTo = (): number[] => {\n  return [1];\n};\n", FRAME),
    ("frame_closure.ts", "export function driftAt(): () => number {\n  return () => 1;\n}\n", FRAME),
    ("frame_arrow_closure.ts", "export const wrapTo = (): (() => number) => () => 1;\n", FRAME),
    ("frame_method.ts", "export class Torus {\n  follow(): number[] {\n    return [1];\n  }\n}\n", FRAME),
    ("frame_plain.ts", "export function moodAt(out: Float32Array): void {\n  out[0] = Math.sqrt(2);\n}\n", None),
    ("frame_setup.ts", "export function newMood(): number[] {\n  return [0, 0];\n}\n", None),
    # The block replaces core's list: what that list holds still holds here.
    ("frame_module.ts", "export const SEEN = new Set<string>();\n", MODULE),
    ("frame_clock.ts", "export function now(): Date {\n  return new Date();\n}\n", "no-restricted-syntax: core takes the time"),
]

# File name, content, and what ESLint must report: a rule, or "rule: the start of its message" when
# one rule holds several guards (no-restricted-syntax's selectors); None: no report at all.
LINT = [
    ("clean.ts", "export function twice(n: number): number {\n  return n * 2;\n}\n", None),
    ("forbidden_import.ts", 'import { readFileSync } from "node:fs";\n\nexport function read(p: string): string {\n  return readFileSync(p, "utf8");\n}\n', "no-restricted-imports"),
    ("cycle_a.ts", 'import { b } from "./cycle_b.ts";\n\nexport function a(): number {\n  return b() + 1;\n}\n', "import-x/no-cycle"),
    ("cycle_b.ts", 'import { a } from "./cycle_a.ts";\n\nexport function b(): number {\n  return a() + 1;\n}\n', "import-x/no-cycle"),
    ("empty_catch.ts", "export function run(g: () => void): void {\n  try {\n    g();\n  } catch {}\n}\n", "no-empty"),
    ("log_catch.ts", "declare const logger: { error: (e: unknown) => void };\n\nexport function run(g: () => void): void {\n  try {\n    g();\n  } catch (e) {\n    logger.error(e);\n  }\n}\n", "no-restricted-syntax: A catch that only logs"),
    ("no_cause.ts", 'export function run(g: () => void): void {\n  try {\n    g();\n  } catch (e) {\n    throw new Error("run failed");\n  }\n}\n', "preserve-caught-error"),
    ("floating.ts", "async function save(): Promise<void> {}\n\nexport function run(): void {\n  save();\n}\n", "@typescript-eslint/no-floating-promises"),
    ("switch.ts", 'type Kind = "a" | "b";\n\nexport function code(k: Kind): number {\n  switch (k) {\n    case "a":\n      return 1;\n  }\n  return 0;\n}\n', "@typescript-eslint/switch-exhaustiveness-check"),
    ("clock.ts", "export function now(): number {\n  return Date.now();\n}\n", "no-restricted-properties: 'Date.now'"),
    ("chance.ts", "export function roll(): number {\n  return Math.random();\n}\n", "no-restricted-properties: 'Math.random'"),
    ("perf.ts", "export function tick(): number {\n  return performance.now();\n}\n", "no-restricted-properties: 'performance.now'"),
    ("long.ts", LONG, "max-lines-per-function"),
    # A u regex's class right before `$`: V8 14.6 misreads a character past the BMP there (F816, F821).
    ("class_at_end.ts", "export const wordy = (s: string): boolean => /[\\p{L}_]$/u.test(s);\n", "no-restricted-syntax: A character class right before `$`"),
    ("alternation_at_end.ts", "export const wordy = (s: string): boolean => /(?:\\p{L}|_)$/u.test(s);\n", None),
    ("eval.ts", "export function run(code: string): unknown {\n  return eval(code);\n}\n", "no-eval"),
    ("useless_catch.ts", "export function run(g: () => void): void {\n  try {\n    g();\n  } catch (e) {\n    throw e;\n  }\n}\n", "no-useless-catch"),
    ("new_function.ts", 'export function make(): unknown {\n  return new Function("return 1");\n}\n', "@typescript-eslint/no-implied-eval"),
    ("long_file.ts", "".join(f"export const v{i} = {i};\n" for i in range(205)), "max-lines"),
    ("complex.ts", "export function grade(n: number): number {\n" + "".join(f"  if (n === {i}) return {i};\n" for i in range(11)) + "  return -1;\n}\n", "complexity"),
    ("deep.ts", "export function deep(a: boolean): number {\n  if (a) {\n    if (a) {\n      if (a) {\n        if (a) {\n          return 1;\n        }\n      }\n    }\n  }\n  return 0;\n}\n", "max-depth"),
    ("params.ts", "export function four(a: number, b: number, c: number, d: number): number {\n  return a + b + c + d;\n}\n", "max-params"),
    ("baseline.css", "@layer components {\n  .a {\n    field-sizing: content;\n  }\n}\n", "css/use-baseline"),
    ("unlayered.css", ".a {\n  color: var(--color-text);\n}\n", "css/use-layers"),
    ("physical.css", "@layer components {\n  .a {\n    margin-left: 0;\n  }\n}\n", "css/prefer-logical-properties"),
    ("clean.css", "@layer components {\n  .a {\n    margin-inline-start: 0;\n  }\n}\n", None),
    ("skipped.test.ts", 'import { test } from "vitest";\n\ntest.skip("x", () => {});\n', "no-restricted-syntax: A test is never switched off"),
    ("focused.test.ts", 'import { test } from "vitest";\n\ntest.only("x", () => {});\n', "no-restricted-syntax: A test is never switched off"),
    ("todo.test.ts", 'import { test } from "vitest";\n\ntest.todo("x");\n', "no-restricted-syntax: A test is never switched off"),
    ("skip_each.test.ts", 'import { test } from "vitest";\n\ntest.skip.each([1])("x %i", () => {});\n', "no-restricted-syntax: A test is never switched off"),
    ("skip_if.test.ts", 'import { test } from "vitest";\n\ntest.skipIf(true)("x", () => {});\n', "no-restricted-syntax: A test is never switched off"),
    ("run_if.test.ts", 'import { test } from "vitest";\n\ntest.runIf(false)("x", () => {});\n', "no-restricted-syntax: A test is never switched off"),
    # A bench switched off measures nothing, as a test switched off checks nothing (security-S1): the bench files too.
    ("skipped.bench.ts", 'const describe = { skip: (name: string, f: () => void): string => name + String(f) };\n\ndescribe.skip("x", () => undefined);\n', "no-restricted-syntax: A test is never switched off"),
    ("focused.bench.tsx", 'const bench = { only: (name: string, f: () => void): string => name + String(f) };\n\nbench.only("x [1 ms]", () => undefined);\n', "no-restricted-syntax: A test is never switched off"),
    ("clean.bench.ts", 'const bench = (name: string, f: () => void): string => name + String(f);\n\nbench("x [1 ms]", () => undefined);\n', None),
    ("pending.test.ts", 'import { expect, test } from "vitest";\n\ntest.fails("x", () => {\n  expect(1).toBe(2);\n});\n', "no-restricted-syntax: A test is never switched off"),
    ("inline_disable.ts", "export function run(code: string): unknown {\n  // eslint-disable-next-line no-eval\n  return eval(code);\n}\n", "no-eval"),
    ("expect_error.ts", "// @ts-expect-error: the reason\nexport const n: number = \"x\";\n", "@typescript-eslint/ban-ts-comment"),
    ("catch_undefined.ts", "export function load(p: Promise<number>): Promise<number | undefined> {\n  return p.catch(() => undefined);\n}\n", "no-restricted-syntax: A .catch that returns undefined"),
    ("catch_empty.ts", "export function load(p: Promise<number>): Promise<number | undefined> {\n  return p.catch(() => {});\n}\n", "no-restricted-syntax: An empty .catch"),
    ("catch_log.ts", "declare const logger: { error: (e: unknown) => void };\n\nexport function load(p: Promise<number>): Promise<number | undefined> {\n  return p.catch((e: unknown) => logger.error(e));\n}\n", "no-restricted-syntax: A .catch that only logs"),
    ("log_return.ts", "declare const logger: { error: (e: unknown) => void };\n\nexport function run(g: () => number): number {\n  try {\n    return g();\n  } catch (e) {\n    logger.error(e);\n    return 0;\n  }\n}\n", "no-restricted-syntax: A catch that logs, then returns"),
    ("void_promise.ts", "async function save(): Promise<void> {}\n\nexport function run(): void {\n  void save();\n}\n", "@typescript-eslint/no-floating-promises"),
    ("finally_return.ts", "export function run(g: () => number): number {\n  try {\n    return g();\n  } finally {\n    return 1;\n  }\n}\n", "no-unsafe-finally"),
    ("new_date.ts", "export function stamp(): number {\n  return new Date().getTime();\n}\n", "no-restricted-syntax: core takes the time"),
    ("date_call.ts", "export function stamp(): string {\n  return Date();\n}\n", "no-restricted-syntax: core takes the time"),
    ("global_this.ts", "export function reach(): unknown {\n  return globalThis;\n}\n", "no-restricted-globals"),
    ("ambient.ts", "declare const fetch: (url: string) => unknown;\n\nexport function load(): unknown {\n  return fetch(\"x\");\n}\n", "no-restricted-syntax: core declares no ambient global"),
    ("declare_function.ts", "declare function fetch(url: string): unknown;\n\nexport function load(): unknown {\n  return fetch(\"x\");\n}\n", "no-restricted-syntax: core declares no ambient global"),
    ("declare_module.ts", "declare namespace host {\n  const secret: string;\n}\n\nexport const n: string = host.secret;\n", "no-restricted-syntax: core declares no ambient global"),
    ("dynamic_import.ts", "export async function load(): Promise<unknown> {\n  return import(\"./clean.ts\");\n}\n", "no-restricted-syntax: core imports only core"),
    ("escape.ts", "import config from \"../../../../vitest.config.ts\";\n\nexport const c: unknown = config;\n", "import-x/no-restricted-paths"),
    ("dom_lib.ts", "/// <reference lib=\"dom\" />\nexport const n = 1;\n", "@typescript-eslint/triple-slash-reference"),
    ("module_map.ts", "const seen = new Map<string, number>();\n\nexport function count(key: string): number {\n  seen.set(key, 1);\n  return seen.size;\n}\n", MODULE),
    ("module_set.ts", "export const SEEN = new Set<string>();\n", MODULE),
    ("local_set.ts", "export function count(keys: string[]): number {\n  return new Set(keys).size;\n}\n", None),
    ("module_table.ts", 'const LIMITS = new Map([["a", 1]]);\n\nexport function limit(k: string): number | undefined {\n  return LIMITS.get(k);\n}\n', MODULE),
    ("module_frozen.ts", 'export const KINDS = Object.freeze(new Set(["a"]));\n', MODULE),
    ("module_object.ts", "export const STATE = { seen: new Set<string>() };\n", MODULE),
    ("module_arrow.ts", "export const make = (): Set<string> => new Set<string>();\n", None),
    ("module_function.ts", "export const make = function (): Map<string, number> {\n  return new Map<string, number>();\n};\n", None),
    # The named exceptions are by name, whole: a Map beside one, or a name that only holds one, is refused.
    ("module_named.ts", "const FORMS = new Map<string, number>();\n\nexport const size = (): number => FORMS.size;\n", None),
    ("module_beside.ts", "const FORMS = new Map<string, number>();\nconst other = new Set<string>();\n\nexport const sizes = (): number => FORMS.size + other.size;\n", MODULE),
    ("module_longer.ts", "const lookupsByRoom = new Map<string, number>();\n\nexport const size = (): number => lookupsByRoom.size;\n", MODULE),
    ("module_map.test.ts", 'import { expect, test } from "vitest";\n\nconst seen = new Set<string>();\n\ntest("x", () => {\n  expect(seen.size).toBe(0);\n});\n', None),
    ("token_elsewhere.css", "@layer components {\n  .a {\n    color: var(--color-text);\n  }\n}\n", None),
    ("invalid.css", "@layer components {\n  .a {\n    color: 12px;\n  }\n}\n", "css/no-invalid-properties"),
    ("important.css", ".a {\n  color: var(--color-text) !important;\n}\n", "css/no-important"),
]


# The messages of React's two bans, in the app and the design system alike.
def banned(name):
    return f"no-restricted-imports: '{name}' import from 'react' is restricted. The React Compiler memoizes"


def restricted(name):
    return f"no-restricted-properties: {name} is restricted from being used. Nothing reaches the DOM as HTML"


def run(cmd, cwd=".", env=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=None if env is None else {**os.environ, **env})


def plant(files, where=HERE):
    os.makedirs(where, exist_ok=True)
    for name, content in files.items():
        os.makedirs(os.path.dirname(os.path.join(where, name)), exist_ok=True)
        with open(os.path.join(where, name), "w") as f:
            f.write(content)


failures = []
# ONLY=<block>[,<block>...] runs only those blocks: harness_mutate runs the one a guard belongs to.
ONLY = set(filter(None, os.environ.get("ONLY", "").split(",")))
ran = set()


# What vitest.config.ts reads to load, copied into a probe's copy: one list, so a file the config comes to read
# (lint/shared.config.ts in b4a33fa, the compiled project in a633d92) breaks no copy for want of it (F1747).
VITEST_CONFIG = ("vitest.config.ts", "lint/shared.config.ts", "app/vitest.compiled.config.ts")


def vitest_config(copy):
    for name in VITEST_CONFIG:
        os.makedirs(os.path.dirname(f"{copy}/{name}"), exist_ok=True)
        shutil.copy(name, f"{copy}/{name}")


def part(name):
    """Whether this block runs: all of them, unless ONLY names some. With ONLY, the first failure
    ends the run: harness_mutate needs one failing block to count a mutant killed."""
    if ONLY and failures:
        ran.add(name)
        return False
    if not ONLY or name in ONLY:
        ran.add(name)
        return True
    return False


def reported(messages):
    """Each rule an ESLint report names, alone and with its message."""
    return {m.get("ruleId") for m in messages} | {f"{m.get('ruleId')}: {m['message']}" for m in messages}


def carries(got, rule):
    """A rule alone matches its name; "rule: words" matches a message that starts with them."""
    return rule in got if ": " not in rule else any(str(g).startswith(rule) for g in got)


def verdicts(cmd, env=None):
    """A Vitest run, and each test's title and status in its JSON report, none when it wrote none. The report goes
    to a file: the run also prints on stdout (another run's port taken, Vite's dependencies), which no parser reads."""
    fd, report = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    try:
        out = run([*cmd, "--reporter=json", f"--outputFile={report}"], env=env)
        try:
            with open(report) as f:
                return out, {t["title"]: t["status"] for r in json.load(f)["testResults"] for t in r["assertionResults"]}
        except (ValueError, KeyError):
            return out, {}
    finally:
        os.remove(report)


def expect(ok, what):
    print(("ok    " if ok else "FAIL  ") + what)
    if not ok:
        failures.append(what)


def lint_cases(cases, where, label):
    """Plant each case in `where`, lint them in one ESLint run, and check each names its rule (None: nothing)."""
    plant({name: content for name, content, _ in cases}, where=where)
    # The planted files only: `where` may hold the app's own, which a run need not read again.
    out = run(["node_modules/.bin/eslint", "--no-cache", "--format", "json", *(os.path.join(where, name) for name, _, _ in cases)])
    try:
        report = {r["filePath"]: reported(r["messages"]) for r in json.loads(out.stdout)}
    except ValueError:
        report = {}
        expect(False, f"eslint ran on {label}: " + (out.stderr or out.stdout)[-300:])
    for name, _, rule in cases:
        # A case's name may hold its folder under `where`: a report is found by the end of its path.
        got = next((found for path, found in report.items() if path.endswith(os.sep + name)), None)
        expect(got is not None, f"eslint {label} {name}: linted")
        got = got or set()
        expect(got == set() if rule is None else carries(got, rule), f"eslint {label} {name}: expected {rule or 'nothing'}, got {sorted(map(str, got))}")


try:
    if part("lint"):
        # ESLint: one run over every planted file, then each file must carry its rule.
        lint_cases(LINT, HERE, "core")
        shutil.rmtree(HERE)
        for folder in ("space", "frame"):
            lint_cases(FRAME_CORE, f"packages/core/src/{folder}/__probe__", f"core {folder}")
            shutil.rmtree(f"packages/core/src/{folder}/__probe__")
        # Elsewhere in core a `field` or a `sample` is nobody's frame.
        lint_cases([("frame_elsewhere.ts", "export function field(): number[] {\n  return [1];\n}\n", None)], HERE, "core elsewhere")
        shutil.rmtree(HERE)

    if part("vitest"):
        # Vitest: a test that asserts nothing fails (expect.requireAssertions).
        plant({"empty.test.ts": 'import { test } from "vitest";\n\ntest("x", () => {});\n'})
        out = run(["node_modules/.bin/vitest", "run", f"{HERE}/empty.test.ts"])
        expect(out.returncode != 0 and "assertion" in (out.stdout + out.stderr).lower(), "vitest refuses a test with no assertion")
        shutil.rmtree(HERE)

    if part("unsteady_real"):
        # unsteady.py reads the reports the real tools write, not stubs' (R1, R4): two files failing at once, a failed test in a
        # nested describe, then what besides the failed files refuses the retry: Vitest's unhandled error (its report holds
        # none), a file that did not load, Playwright's top-level errors (here a global teardown that throws).
        unsteady = os.path.realpath("scripts/unsteady.py")
        vitest, playwright = os.path.realpath("node_modules/.bin/vitest"), os.path.realpath("app/node_modules/@playwright/test/cli.js")
        failing = lambda name: f'import {{ describe, expect, test }} from "vitest";\n\ndescribe("outer", () => {{\n  test("{name} fails", () => {{\n    expect(1).toBe(2);\n  }});\n}});\n'
        timer = 'import { test } from "vitest";\n\ntest("late", async () => {\n  setTimeout(() => {\n    throw new Error("late");\n  }, 5);\n  await new Promise((r) => setTimeout(r, 50));\n});\n'
        broken = 'import "./missing.ts";\nimport { test } from "vitest";\n\ntest("c", () => undefined);\n'
        spec = lambda name: f'import {{ expect, test }} from "@playwright/test";\n\ntest.describe("outer", () => {{\n  test("{name} fails", () => {{\n    expect(1).toBe(2);\n  }});\n}});\n'
        config = 'import { defineConfig } from "@playwright/test";\n\nexport default defineConfig({ testDir: "tests"%s });\n'
        teardown = 'export default function teardown(): void {\n  throw new Error("teardown");\n}\n'
        # name: (the tool, its files, the refusal's words or None when the retry goes on, the failed files and tests the log names)
        cases = {
            "vitest_two": ("vitest", {"tests/a.test.ts": failing("a"), "tests/b.test.ts": failing("b")}, None, ["tests/a.test.ts", "tests/b.test.ts", "outer a fails", "outer b fails"]),
            "vitest_unhandled": ("vitest", {"tests/a.test.ts": failing("a"), "tests/late.test.ts": timer}, "an unhandled error", []),
            "vitest_no_load": ("vitest", {"tests/a.test.ts": failing("a"), "tests/c.test.ts": broken}, "failed with no failed test", []),
            "playwright_nested": ("playwright", {"playwright.config.ts": config % "", "tests/a.spec.ts": spec("a")}, None, ["tests/a.spec.ts", "outer > a fails"]),
            "playwright_teardown": ("playwright", {"playwright.config.ts": config % ', globalTeardown: "./teardown.ts"', "teardown.ts": teardown, "tests/a.spec.ts": spec("a")}, "errors of its own", []),
        }
        with tempfile.TemporaryDirectory() as root:
            for case, (tool, files, refusal, logged) in cases.items():
                where = os.path.join(os.path.realpath(root), case)
                plant(files, where=where)
                os.symlink(os.path.realpath("node_modules" if tool == "vitest" else "app/node_modules"), f"{where}/node_modules")
                report, output, log = f"{where}/report.json", f"{where}/output.txt", f"{where}/unsteady.log"
                if tool == "vitest":
                    first = run([vitest, "run", "--reporter=default", "--reporter=json", f"--outputFile.json={report}"], cwd=where)
                else:
                    first = run(["node", playwright, "test", "-c", "playwright.config.ts", "--reporter=dot,json"], cwd=where, env={"PLAYWRIGHT_JSON_OUTPUT_NAME": report})
                with open(output, "w") as f:
                    f.write(first.stdout + first.stderr)
                out = run([sys.executable, "-I", unsteady, tool, report, output, log, "10 160", "--", "true"], cwd=where)
                said = out.stdout + out.stderr
                expect(first.returncode != 0 and os.path.exists(report), f"unsteady {case}: the real {tool} run fails and writes its report")
                if refusal is None:
                    got = open(log).read() if os.path.exists(log) else ""
                    ok = out.returncode == 0 and all(name in got for name in logged) and got.count("\n") == len([n for n in logged if "/" in n])
                    expect(ok, f"unsteady {case}: the retry goes on and logs {logged}" + ("" if ok else f": {said[-200:]} {got}"))
                else:
                    ok = out.returncode != 0 and refusal in said and not os.path.exists(log)
                    expect(ok, f"unsteady {case}: refuses with {refusal!r}, logging nothing" + ("" if ok else f": {said[-200:]}"))

    if part("pinned_node"):
        # Every Vitest run is on the Node .node-version pins, whatever it runs: vitest.config.ts refuses another Node as every
        # run reads it (a whole run, one project, `list`; StrykerJS's dry run and `bench` start Vitest the same way, through
        # createVitest). Another V8 reads some regexes otherwise (F816 came from StrykerJS on Homebrew's Node 26). Probed on a
        # copy of the config with a pin of its own: .node-version, which check.sh reads for its PATH and the sandbox keeps from
        # a command, stays as it is even when this run is killed (G10).
        with open(".node-version") as f:
            pinned = f.read()
        refusal = "Vitest runs on Node"
        with tempfile.TemporaryDirectory() as copy:
            os.makedirs(f"{copy}/packages/probe/src")
            vitest_config(copy)
            with open(f"{copy}/packages/probe/src/a.test.ts", "w") as f:
                f.write('import { expect, test } from "vitest";\n\ntest("a", () => {\n  expect(1).toBe(1);\n});\n')
            os.symlink(os.path.realpath("node_modules"), f"{copy}/node_modules")
            vitest = os.path.realpath("node_modules/.bin/vitest")
            for pin, passes in ((pinned, True), ("0.0.1\n", False)):
                with open(f"{copy}/.node-version", "w") as f:
                    f.write(pin)
                for args in (["run"], ["run", "--project", "ui"], ["list"]):
                    out = run([vitest, *args], cwd=copy)
                    said = out.stdout + out.stderr
                    if passes:
                        expect(refusal not in said, f"vitest {' '.join(args)} runs in a copy with the real pin")
                    else:
                        expect(out.returncode != 0 and f"{refusal} v0.0.1" in said, f"vitest {' '.join(args)} refuses a Node .node-version does not pin")
                    if passes and args == ["run"]:
                        expect(out.returncode == 0 and "1 passed" in out.stdout, "vitest passes a test in a copy with the real pin")

    if part("bench_files"):
        # Vitest runs the benches vitest.config.ts names, the form `*.bench.ts(x)` that ESLint's BENCHES and BENCH_FILE
        # (bench.py, check_regressions.py) read, and no other: its own default, `*.{bench,benchmark}.?(c|m)[jt]s?(x)`, ran
        # a `room.benchmark.tsx` or an `x.bench.mts` no guard named, switched off or not (CR3). On a copy of the config
        # (and the lint's shared names it imports), with one bench of each form.
        forms = {"a.bench.ts": True, "b.bench.tsx": True, "c.benchmark.ts": False, "d.bench.mts": False, "e.benchmark.tsx": False}
        with tempfile.TemporaryDirectory() as copy:
            os.makedirs(f"{copy}/packages/probe/src")
            vitest_config(copy)
            shutil.copy(".node-version", f"{copy}/.node-version")
            os.symlink(os.path.realpath("node_modules"), f"{copy}/node_modules")
            for name in forms:
                with open(f"{copy}/packages/probe/src/{name}", "w") as f:
                    f.write(f'import {{ bench }} from "vitest";\n\nbench("{name[0]} [1000 ms]", () => undefined);\n')
            report = f"{copy}/bench.json"
            out = run([os.path.realpath("node_modules/.bin/vitest"), "bench", "--run", "--project", "node", "--outputJson", report], cwd=copy)
            ran_ok = out.returncode == 0 and os.path.exists(report)
            expect(ran_ok, "vitest runs the benches of a copy" + ("" if ran_ok else f": {(out.stdout + out.stderr)[-300:]}"))
            if os.path.exists(report):
                with open(report) as f:
                    ran_files = {os.path.basename(file["filepath"]) for file in json.load(f).get("files", [])}
                ours_only = ran_files == {n for n, ours in forms.items() if ours}
                expect(ours_only, "vitest runs the benches in the form the guards read, and no other" + ("" if ours_only else f": {sorted(ran_files)}"))
            for name, ours in forms.items():
                expect(bool(BENCH_FILE.search(name)) == ours, f"BENCH_FILE reads {name} as the guards' bench form does: {ours}")

    if part("core_chromium"):
        # Core's tests run a second time in Chromium, whose engine reads some regexes and Unicode otherwise than
        # Node's (F816, F817), and only when CORE_CHROMIUM is set: a planted test that passes on
        # Node fails there while a clean one passes beside it, a failure writes nothing beside the code, and with no
        # CORE_CHROMIUM, `vitest list` (check_regressions.py) lists core's tests on Node alone, opening no browser.
        tests = {"engine.test.ts": ("outside a page", 'expect(typeof document).toBe("undefined")'), "clean.test.ts": ("anywhere", "expect(1 + 1).toBe(2)")}
        plant({name: f'import {{ expect, test }} from "vitest";\n\ntest("{title}", () => {{\n  {check};\n}});\n' for name, (title, check) in tests.items()})
        paths = [f"{HERE}/{name}" for name in tests]
        out = run(["node_modules/.bin/vitest", "run", "--project", "node", *paths])
        expect(out.returncode == 0, "core's planted tests pass on Node")
        out, states = verdicts(["node_modules/.bin/vitest", "run", "--project", "core_chromium", *paths], env={"CORE_CHROMIUM": "1"})
        expect(states == {"outside a page": "failed", "anywhere": "passed"}, f"core_chromium runs core's tests in a page: {states or (out.stderr or out.stdout)[-300:]}")
        expect(not os.path.exists(f"{HERE}/__screenshots__") and not os.path.exists(".vitest-attachments"), "core_chromium writes nothing beside the code on a failure")
        # Plain lines, `[project] file > title`: `--json` would take the next path for its output file.
        out = run(["node_modules/.bin/vitest", "list", *paths])
        projects = {line[1:line.index("]")] for line in out.stdout.splitlines() if line.startswith("[") and "]" in line}
        expect(out.returncode == 0 and projects == {"node"}, f"with no CORE_CHROMIUM, vitest lists core's tests on Node alone: {projects or out.stderr[-300:]}")
        shutil.rmtree(HERE)

    if part("tokens_pictures"):
        # The fast gate compares the tokens story's pictures when tokens.css changes (F1190): a token added with no new
        # picture fails the run it makes, the untouched tree passes it, a prefix no story has fails rather than
        # comparing nothing, and a port that is no port refuses. On a copy of the tracked files as they are (as pre-commit's
        # staged copy: no repository, borrowing node_modules), so this tree's tokens.css is never written, even by a run
        # killed half-way.
        with tempfile.TemporaryDirectory() as tree, socket.socket() as held:
            files = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True).stdout
            packed = subprocess.run(["tar", "-c", "--null", "-T", "-"], input=files, capture_output=True, check=True).stdout
            subprocess.run(["tar", "-x", "-C", tree], input=packed, check=True)
            # From where the packages are installed: in a harness_mutate copy this folder's node_modules is one link (the helper
            # finds only real folders), and the workspaces' relative links need the root's beside them.
            subprocess.run(["sh", os.path.abspath("scripts/borrow_node_modules.sh"), tree], cwd=os.path.dirname(os.path.realpath("node_modules")), check=True)
            held.bind(("127.0.0.1", 0))
            port = str(held.getsockname()[1])
            held.close()  # the file server takes the port it found free
            pictures = lambda of, **env: run(["node", "app/node_modules/@playwright/test/cli.js", "test", "-c", "app/playwright.stories.config.ts",
                                              "--reporter=dot", "pictures"], cwd=tree, env={"PICTURES_OF": of, "STORIES_PORT": port, **env})
            # Where the fast gate has Storybook built: check.sh's run folder, `check.XXXXXX`, under the temporary folder, whose
            # `storybook` it takes: out of the tree its checks read.
            run_folder = tempfile.TemporaryDirectory(prefix="check.")
            built = os.path.join(run_folder.name, "storybook")
            out = pictures("tokens--", STORIES_OUT=built)
            expect(out.returncode == 0 and "3 passed" in out.stdout, "the tokens story's pictures pass on an untouched tree")
            expect(os.path.exists(f"{built}/index.json") and not os.path.exists(os.path.join(tree, "packages/ui/storybook-static")),
                   "STORIES_OUT takes Storybook's build out of the design system's folder")
            out = pictures("nosuchstory--")
            expect(out.returncode != 0 and "a story whose id starts with" in out.stdout + out.stderr, "a prefix no story has fails, comparing nothing")
            out = pictures("tokens--", STORIES_PORT="abc")
            expect(out.returncode != 0 and "STORIES_PORT is no port" in out.stdout + out.stderr, "a port that is no port is refused")
            # Storybook deletes its output folder before it builds (storybook/dist/core-server/index.js, `rm(outputDir, { recursive,
            # force })`), so a STORIES_OUT that is not a folder inside the temporary folder is refused before any build (security-S6).
            # Every value here is harmless even with the guard off: the folder of a TMPDIR of the copy's own, a relative one, one
            # out of the system's, or with a space or a shell character in it, never the real temporary folder or /.
            fake = os.path.join(tree, "fake-tmp")
            os.makedirs(fake)
            for what, where, tmp in (("the temporary folder itself", fake, fake), ("the folder above the temporary one", f"{fake}/..", fake),
                                     ("a folder out of the temporary one by `..`", f"{fake}/../escaped", fake),
                                     ("a relative folder, which would sit inside it", "storybook-out", os.path.realpath(tree)),
                                     # A run folder's storybook by every rule but the shape of the path itself: only that shape's
                                     # check refuses these (a temporary folder with a space or a shell character in its own name,
                                     # a relative path that resolves into one).
                                     ("a relative run folder's storybook, which would sit inside it", "check.abc123/storybook", os.path.realpath(tree)),
                                     ("a run folder's storybook under a temporary folder with a space", f"{fake}/a b/check.abc123/storybook", f"{fake}/a b"),
                                     ("a run folder's storybook under a temporary folder with a shell character", f"{fake}/x;true/check.abc123/storybook", f"{fake}/x;true"),
                                     ("a folder out of the temporary one", "/elsewhere/storybook", fake),
                                     ("a folder with a space", f"{fake}/a b", fake), ("a folder with a shell character", f"{fake}/x;true", fake),
                                     # Inside the temporary folder, none of them check.sh's own `check.*/storybook` (CR7)
                                     ("another folder of the temporary one", f"{fake}/other-folder", fake),
                                     ("the folder of another session", f"{fake}/-Users-someone-Server-gnoworld", fake),
                                     ("a run folder itself", f"{fake}/check.abc123", fake), ("a folder of a run folder other than storybook", f"{fake}/check.abc123/other", fake),
                                     ("a storybook folder out of a run folder", f"{fake}/storybook", fake), ("a folder under a run folder's storybook", f"{fake}/check.abc123/storybook/x", fake),
                                     ("a storybook folder of a folder not a run's", f"{fake}/other/storybook", fake),
                                     ("a run folder's storybook, deeper in the temporary folder", f"{fake}/other/check.abc123/storybook", fake),
                                     ("a storybook folder of a folder named check, not check.*", f"{fake}/checkabc123/storybook", fake),
                                     # `..` is resolved before the rule reads the folder, so none of them gets out of it (R5).
                                     ("a run folder's storybook, by `..`", f"{fake}/check.abc123/storybook/..", fake),
                                     ("a folder out of a run folder's storybook, by `..`", f"{fake}/check.abc123/storybook/../../escaped", fake),
                                     ("a folder not a run's, by `..` into a run folder's name", f"{fake}/check.abc123/storybook/../../other/storybook", fake)):
                out = pictures("tokens--", STORIES_OUT=where, TMPDIR=tmp)
                expect(out.returncode != 0 and "STORIES_OUT must be" in out.stdout + out.stderr, f"STORIES_OUT as {what} is refused before Storybook deletes it")
            # What the rule accepts, said as a case (R5): the storybook folder of any `check.*` run folder, another gate's run
            # included (CR7: its residual state, since a folder the rule cannot tell apart is another run's), and a `..` that
            # resolves to one. The config loads; `--list` starts no server and builds nothing.
            for what, where in (("another gate's run folder's storybook", f"{fake}/check.zzz999/storybook"),
                                ("a run folder's storybook reached by `..`", f"{fake}/other/../check.abc123/storybook")):
                out = run(["node", "app/node_modules/@playwright/test/cli.js", "test", "-c", "app/playwright.stories.config.ts", "--list", "pictures"],
                          cwd=tree, env={"PICTURES_OF": "tokens--", "STORIES_PORT": port, "STORIES_OUT": where, "TMPDIR": fake})
                ok = out.returncode == 0 and "STORIES_OUT must be" not in out.stdout + out.stderr
                expect(ok, f"STORIES_OUT as {what} is accepted" + ("" if ok else f": {(out.stdout + out.stderr)[-200:]}"))
            # The tools missing: never a pass on nothing. No browser where Playwright looks (tokens.css as approved); then,
            # once tokens.css is as approved again, no Storybook to build.
            out = pictures("tokens--", PLAYWRIGHT_BROWSERS_PATH=os.path.join(tree, "no-browsers"))
            expect(out.returncode != 0, "the tokens story's pictures fail with no browser to compare them in")
            css = os.path.join(tree, "packages/ui/src/tokens.css")
            with open(css) as f:
                text = f.read()
            at = "    --color-space: var(--p-space);\n"
            expect(at in text, "tokens.css still holds the line the probe adds a token after")
            with open(css, "w") as f:
                f.write(text.replace(at, at + "    --color-probe: var(--p-space);\n", 1))
            out = pictures("tokens--")
            expect(out.returncode != 0 and "tokens--all" in out.stdout + out.stderr, "a token added to tokens.css with no new picture fails the tokens story's pictures")
            # The evidence of a failed run is in a folder of its own, never Playwright's default `app/test-results` that the journeys
            # (the ts lane, beside the pictures' lane) empty as they start (CR4): beside the run's Storybook build in a gate,
            # `app/test-results-stories` otherwise.
            expect(os.path.isdir(os.path.join(tree, "app/test-results-stories")) and not os.path.exists(os.path.join(tree, "app/test-results")),
                   "the stories' evidence is in app/test-results-stories, not the journeys' app/test-results")
            out = pictures("tokens--", STORIES_OUT=built)
            expect(out.returncode != 0 and os.path.isdir(os.path.join(run_folder.name, "stories-results")) and not os.path.exists(os.path.join(tree, "app/test-results")),
                   "the stories' evidence of a gate's run is in the run's folder, beside its Storybook build")
            with open(css, "w") as f:
                f.write(text)
            os.remove(os.path.join(tree, "packages/ui/node_modules/.bin/storybook"))
            out = pictures("tokens--")
            expect(out.returncode != 0, "the tokens story's pictures fail with no Storybook to build")
            run_folder.cleanup()

    if part("vitest_ui"):
        # The design system's tests run in jsdom, each on an empty page: none is left out by the
        # project's globs, and the setup's cleanup holds (the second test sees one paragraph).
        page = 'test("ui probe {}", () => {{\n  render(<p>once</p>);\n  expect(screen.getAllByText("once")).toHaveLength(1);\n}});\n'.format
        plant({"probe.test.tsx": 'import { render, screen } from "@testing-library/react";\nimport { expect, test } from "vitest";\n\n' + page("one") + page("two")
               + 'test("ui probe fails", () => {\n  expect(document.title).toBe("never this title");\n});\n'}, where=UI)
        out, states = verdicts(["node_modules/.bin/vitest", "run", f"{UI}/probe.test.tsx"])
        expect(states == {"ui probe one": "passed", "ui probe two": "passed", "ui probe fails": "failed"}, f"vitest runs ui's tests in jsdom, each on an empty page: {states}")
        shutil.rmtree(UI)

    if part("prettier"):
        # Prettier: a file that is not formatted.
        plant({"messy.ts": "export const  a={b:1,\n c :2}\n"})
        out = run(["node_modules/.bin/prettier", "--check", HERE])
        expect(out.returncode != 0 and "messy.ts" in out.stdout + out.stderr, "prettier refuses an unformatted file")
        shutil.rmtree(HERE)

    if part("tsc"):
        # tsc: core sees neither the DOM nor Node, so it cannot reach the network.
        plant({"net.ts": "export function load(): unknown {\n  return fetch;\n}\n"})
        out = run(["node_modules/.bin/tsc", "-p", "tsconfig.json"])
        expect(out.returncode != 0 and "Cannot find name 'fetch'" in out.stdout, "tsc refuses fetch in core")
        shutil.rmtree(HERE)

    if part("outside_core"):
        # Outside core as in it: `fails` is refused (no pairing since slice 4), and a swallowed error too.
        lint = dict((n, c) for n, c, _ in LINT)
        lint_cases([("pending.test.ts", 'import { expect, test } from "vitest";\n\ntest.fails("x", () => {\n  expect(1).toBe(2);\n});\n', "no-restricted-syntax: A test is never switched off"),
                    ("log_catch.ts", lint["log_catch.ts"], "no-restricted-syntax: A catch that only logs"),
                    # Every workspace's source, not core's, ui's and the server's alone: schemas too.
                    ("module_map.ts", lint["module_map.ts"], MODULE),
                    ("module_map.test.ts", lint["module_map.test.ts"], None)],
                   "packages/probe/src", "outside core")
        shutil.rmtree("packages/probe")

    if part("react"):
        # React in the app: hooks' rules, the compiler's memoization, nothing raw into the DOM.
        component = "export function Card({{ n }}: {{ n: number }}) {{\n{body}}}\n".format
        uses = 'import {{ {} }} from "react";\n\n'.format
        def effect(code):
            return uses("useEffect") + component(body=f"  useEffect(() => {{\n    {code}\n  }}, []);\n  return <p>{{n}}</p>;\n")

        def ref(code):
            return uses("useEffect, useRef") + component(body=f"  const boxRef = useRef<HTMLDivElement>(null);\n  useEffect(() => {{\n    if (boxRef.current) {code}\n  }});\n  return <div ref={{boxRef}} />;\n")
        off = "no-restricted-syntax: A test is never switched off"
        react = [
            ("clean.tsx", component(body="  return <p>{n}</p>;\n"), None),
            # The app draws its own links (React Router's): ui's rule against a raw <a> is ui's alone.
            ("anchor.tsx", 'export function Go() {\n  return <a href="/x">Go</a>;\n}\n', None),
            ("route_404.ts", 'import { data } from "react-router";\n\nexport function loader(): never {\n  throw data(null, { status: 404 });\n}\n', None),
            ("throw_string.ts", 'export function loader(): never {\n  throw "missing";\n}\n', "@typescript-eslint/only-throw-error"),
            ("conditional_hook.tsx", uses("useState") + component(body="  if (n > 1) {\n    useState(0);\n  }\n  return <p>{n}</p>;\n"), "react-hooks/rules-of-hooks"),
            ("manual_memo.tsx", uses("useMemo") + component(body="  const twice = useMemo(() => n * 2, [n]);\n  return <p>{twice}</p>;\n"), banned("useMemo")),
            ("manual_callback.tsx", uses("useCallback") + component(body="  const f = useCallback(() => n, [n]);\n  return <p>{f()}</p>;\n"), banned("useCallback")),
            ("memo_wrap.tsx", uses("memo") + "export const Card = memo(function Card({ n }: { n: number }) {\n  return <p>{n}</p>;\n});\n", banned("memo")),
            ("namespace_memo.tsx", 'import * as React from "react";\n\n' + component(body="  const twice = React.useMemo(() => n * 2, [n]);\n  return <p>{twice}</p>;\n"), "no-restricted-imports: * import is invalid because 'memo', 'useMemo', and 'useCallback'"),
            ("default_memo.tsx", 'import React from "react";\n\n' + component(body="  const twice = React.useMemo(() => n * 2, [n]);\n  return <p>{twice}</p>;\n"), "no-restricted-properties: 'React.useMemo' is restricted from being used. The React Compiler memoizes"),
            ("forward_ref.tsx", uses("forwardRef") + "export const Card = forwardRef<HTMLParagraphElement>(function Card(_, r) {\n  return <p ref={r} />;\n});\n", "@eslint-react/no-forward-ref"),
            ("nested.tsx", component(body="  function Inner() {\n    return <p>{n}</p>;\n  }\n  return <Inner />;\n"), "@eslint-react/no-nested-component-definitions"),
            ("effect_state.tsx", uses("useEffect, useState") + component(body="  const [m, setM] = useState(0);\n  useEffect(() => {\n    setM(n);\n  }, [n]);\n  return <p>{m}</p>;\n"), "react-hooks/set-state-in-effect"),
            ("render_state.tsx", uses("useState") + component(body="  const [m, setM] = useState(0);\n  setM(n);\n  return <p>{m}</p>;\n"), "react-hooks/set-state-in-render"),
            ("impure.tsx", component(body="  const t = Date.now();\n  return <p>{t + n}</p>;\n"), "react-hooks/purity"),
            ("ref_in_render.tsx", uses("useRef") + component(body="  const r = useRef(n);\n  return <p>{r.current}</p>;\n"), "react-hooks/refs"),
            ("mutated_prop.tsx", "export function Card({ item }: { item: { n: number } }) {\n  item.n = 1;\n  return <p>{item.n}</p>;\n}\n", "react-hooks/immutability"),
            ("deps.tsx", effect("document.title = String(n);"), "react-hooks/exhaustive-deps"),
            ("listener.tsx", effect('window.addEventListener("resize", () => n);'), "@eslint-react/web-api-no-leaked-event-listener"),
            ("timeout.tsx", effect("setTimeout(() => n, 1);"), "@eslint-react/web-api-no-leaked-timeout"),
            ("raw_html.tsx", component(body="  return <p dangerouslySetInnerHTML={{ __html: String(n) }} />;\n"), "@eslint-react/dom-no-dangerously-set-innerhtml"),
            ("inner_html.tsx", ref("boxRef.current.innerHTML = String(n);"), restricted("'innerHTML'")),
            ("outer_html.tsx", ref("boxRef.current.outerHTML = String(n);"), restricted("'outerHTML'")),
            ("adjacent_html.tsx", ref('boxRef.current.insertAdjacentHTML("beforeend", String(n));'), restricted("'insertAdjacentHTML'")),
            ("document_write.tsx", ref("document.write(String(n));"), restricted("'document.write'")),
            ("leaked.tsx", component(body="  return <div>{n && <p>{n}</p>}</div>;\n"), "@eslint-react/no-leaked-conditional-rendering"),
            ("index_key.tsx", component(body="  return <ul>{[n].map((v, i) => <li key={i}>{v}</li>)}</ul>;\n"), "@eslint-react/no-array-index-key"),
            ("missing_key.tsx", component(body="  return <ul>{[n].map((v) => <li>{v}</li>)}</ul>;\n"), "@eslint-react/no-missing-key"),
            ("script_url.tsx", component(body='  return <a href="javascript:void(0)">{n}</a>;\n'), "@eslint-react/dom-no-script-url"),
            ("blank.tsx", component(body='  return <a href="https://gno.land" target="_blank">{n}</a>;\n'), "@eslint-react/dom-no-unsafe-target-blank"),
            ("fixme.spec.ts", 'import { test } from "@playwright/test";\n\ntest.fixme("x", () => {});\n', off),
            ("expected_fail.spec.ts", 'import { test } from "@playwright/test";\n\ntest.fail("x", () => {});\n', off),
            ("renamed_fail.spec.ts", 'import { test as base } from "@playwright/test";\n\nbase.fail("x", () => {});\n', off),
            ("skipped.spec.ts", 'import { test } from "@playwright/test";\n\ntest.describe.skip("x", () => {});\n', off),
        ]
        lint_cases(react, APP, "app")
        shutil.rmtree(APP)

    if part("ui_lint"):
        # The design system: React's rules as in the app, and it imports nothing but itself. Its app target is routes.ts,
        # the one app file no slice renames: a target that does not resolve is no violation (5c renamed worlds.ts).
        ui = [
            ("clean.tsx", "export function Card({ n }: { n: number }) {\n  return <p>{n}</p>;\n}\n", None),
            ("manual_memo.tsx", 'import { useMemo } from "react";\n\nexport function Card({ n }: { n: number }) {\n  const twice = useMemo(() => n * 2, [n]);\n  return <p>{twice}</p>;\n}\n',
             banned("useMemo")),
            ("nested.tsx", "export function Card({ n }: { n: number }) {\n  function Inner() {\n    return <p>{n}</p>;\n  }\n  return <Inner />;\n}\n", "@eslint-react/no-nested-component-definitions"),
            ("reaches_app.ts", 'import routes from "../../../../app/src/routes.ts";\n\nexport const w: unknown = routes;\n', "import-x/no-restricted-paths"),
            ("reaches_core.ts", 'import * as core from "../../../core/src/index.ts";\n\nexport const c: unknown = core;\n', "import-x/no-restricted-paths"),
            ("reaches_config.ts", 'import config from "../../../../vitest.config.ts";\n\nexport const c: unknown = config;\n', "import-x/no-restricted-paths"),
            ("passes_app_on.ts", 'export { default } from "../../../../app/src/routes.ts";\n', "import-x/no-restricted-paths"),
            ("loads_app.ts", 'export async function load(): Promise<unknown> {\n  return import("../../../../app/src/routes.ts");\n}\n', "import-x/no-restricted-paths"),
            ("raw_html.tsx", "export function Card({ n }: { n: string }) {\n  return <p dangerouslySetInnerHTML={{ __html: n }} />;\n}\n", "@eslint-react/dom-no-dangerously-set-innerhtml"),
            # A link drawn past the slot would reload the app on the site's own paths (F259, F317).
            ("raw_anchor.tsx", "export function Card({ href }: { href: string }) {\n  return <a href={href}>Go</a>;\n}\n",
             "no-restricted-syntax: A link in ui is an Anchor"),
            # Nor by createElement, React's or imported, nor a form, which navigates too (F360).
            ("create_anchor.tsx", 'import { createElement } from "react";\n\nexport function Card({ href }: { href: string }) {\n  return createElement("a", { href }, "Go");\n}\n',
             "no-restricted-syntax: A link in ui is an Anchor"),
            ("react_anchor.tsx", 'import React from "react";\n\nexport function Card({ href }: { href: string }) {\n  return React.createElement("a", { href }, "Go");\n}\n',
             "no-restricted-syntax: A link in ui is an Anchor"),
            ("raw_form.tsx", 'export function Search() {\n  return <form action="/search" />;\n}\n', "no-restricted-syntax: A link in ui is an Anchor"),
            # The rule replaces ui's no-restricted-syntax in .tsx: the swallowed catch must stay refused.
            ("log_catch.tsx", "declare const logger: { error: (e: unknown) => void };\n\nexport function run(g: () => void): void {\n  try {\n    g();\n  } catch (e) {\n    logger.error(e);\n  }\n}\n",
             "no-restricted-syntax: A catch that only logs"),
            # Its exceptions: a story or a test may draw a plain <a>.
            ("Go.stories.tsx", 'export function Plain() {\n  return <a href="/x">Go</a>;\n}\n', None),
            ("Go.test.tsx", 'import { render } from "@testing-library/react";\nimport { expect, it } from "vitest";\n\nit("draws a link", () => {\n  const { container } = render(<a href="/x">Go</a>);\n  expect(container.querySelector("a")).not.toBeNull();\n});\n', None),
            ("inner_html.tsx", 'import { useEffect, useRef } from "react";\n\nexport function Card({ n }: { n: string }) {\n  const boxRef = useRef<HTMLDivElement>(null);\n  useEffect(() => {\n    if (boxRef.current) boxRef.current.innerHTML = n;\n  });\n  return <div ref={boxRef} />;\n}\n',
             restricted("'innerHTML'")),
            ("module_map.tsx", "const seen = new WeakMap<object, string>();\n\nexport function Card({ n }: { n: object }) {\n  return <p>{seen.get(n)}</p>;\n}\n", MODULE),
            ("module_set.ts", "export const SEEN = new Set<string>();\n", MODULE),
            ("module_set.test.tsx", 'import { expect, it } from "vitest";\n\nconst seen = new Set<string>();\n\nit("x", () => {\n  expect(seen.size).toBe(0);\n});\n', None),
            # A control keeps the system's colours under forced colours: only the avatar's face may not (F319, F349).
            ("forced.css", FORCED, "css/use-baseline"),
            # field-sizing and resize are the box of lines' alone (F1729): anywhere else they are refused, the avatar's included.
            ("sizing.css", SIZING, "css/use-baseline"),
            ("resize.css", RESIZE, "css/use-baseline"),
        ]
        lint_cases(ui, UI, "ui")
        shutil.rmtree(UI)
        lint_cases([("face.css", FORCED, None)], AVATAR, "ui avatar")
        shutil.rmtree(AVATAR)
        lint_cases([("sizing.css", SIZING, None), ("resize.css", RESIZE, None), ("forced.css", FORCED, "css/use-baseline")], FIELD, "ui field")
        shutil.rmtree(FIELD)

    if part("app_folders"):
        # The app's folders (docs/ARCHITECTURE.md, F378), each case planted where its rule reaches: the
        # worker imports only itself, a feature another only through its index.ts, a route never the
        # scene; the network and storage only in lib and the worker; console nowhere.
        src = "app/src"
        uses = 'import {{ {name} }} from "{path}";\n\nexport const used: unknown = {name};\n'.format
        reach = "export function load(): unknown {{\n  return {};\n}}\n".format
        onframe = "export class Loop {{\n  seen = 0;\n\n  draw(list: number[]): unknown {{\n    {}\n    return this.seen;\n  }}\n}}\n".format
        net = "The network and storage are lib's"
        app = [
            ("sw/__probe__/sw_clean.ts", uses(name="TAKE_OVER", path="../worker.ts"), None),
            ("sw/__probe__/sw_feature.ts", uses(name="UpdatePrompt", path="../../features/update/index.ts"), "import-x/no-restricted-paths"),
            ("sw/__probe__/sw_fetch.ts", reach('fetch("/sw.js")'), None),
            ("sw/__probe__/sw_tested.test.ts", 'import { expect, test } from "vitest";\n\ntest("x", () => {\n  expect(1).toBe(1);\n});\n', None),
            # A package is refused by its name, installed or not, wherever node_modules sits (F385);
            # a path out of the folder by the zone.
            ("sw/__probe__/sw_package.ts", uses(name="precacheAndRoute", path="workbox-precaching"), "no-restricted-imports"),
            ("sw/__probe__/sw_scoped.ts", uses(name="precache", path="@workbox/precaching"), "no-restricted-imports"),
            ("sw/__probe__/sw_node.ts", uses(name="readFileSync", path="node:fs"), "no-restricted-imports"),
            ("sw/__probe__/sw_dynamic.ts", "export function load(): Promise<unknown> {\n  return import(\"workbox-precaching\");\n}\n", "no-restricted-syntax: The worker imports only sw"),
            ("sw/__probe__/sw_log_catch.ts", dict((n, c) for n, c, _ in LINT)["log_catch.ts"], "no-restricted-syntax: A catch that only logs"),
            # A folder with no list of its own takes the root's (eslint.config.ts): the server's and the packages'
            # lists replace it where the probe planted this before.
            ("features/__probe__/log_catch.ts", dict((n, c) for n, c, _ in LINT)["log_catch.ts"], "no-restricted-syntax: A catch that only logs"),
            ("sw/__probe__/sw_reaches_ui.ts", uses(name="Button", path="../../../../packages/ui/src/index.ts"), "import-x/no-restricted-paths"),
            ("features/__probe__/through_index.ts", uses(name="UpdatePrompt", path="../update/index.ts"), None),
            ("features/__probe__/own_file.ts", uses(name="used", path="./through_index.ts"), None),
            ("features/__probe__/uses_sw.ts", uses(name="hostAnswers", path="../../sw/register.ts"), None),
            ("features/__probe__/past_index.ts", uses(name="UpdatePrompt", path="../update/UpdatePrompt.tsx"), "import-x/no-restricted-paths"),
            # A feature's screens are .tsx, the routes and the app's own root files reach no network either.
            ("features/__probe__/past_index_view.tsx", uses(name="UpdatePrompt", path="../update/UpdatePrompt.tsx"), "import-x/no-restricted-paths"),
            ("features/__probe__/view_fetch.tsx", reach('fetch("/x")'), f"no-restricted-globals: Unexpected use of 'fetch'. {net}"),
            ("routes/__probe__/route_fetch.ts", reach('fetch("/x")'), f"no-restricted-globals: Unexpected use of 'fetch'. {net}"),
            ("probe_root_fetch.ts", reach('fetch("/x")'), f"no-restricted-globals: Unexpected use of 'fetch'. {net}"),
            *[(f"features/__probe__/bare_{name}.ts", reach(name), f"no-restricted-globals: Unexpected use of '{name}'. {net}") for name in REACHES],
            *[(f"features/__probe__/{owner}_fetch.ts", reach(f"{owner}.fetch"), f"no-restricted-properties: '{owner}.fetch' is restricted from being used. {net}") for owner in ("window", "globalThis", "self")],
            ("features/__probe__/cookie.ts", reach("document.cookie"), f"no-restricted-properties: 'document.cookie' is restricted from being used. {net}"),
            ("features/__probe__/beacon.ts", reach('navigator.sendBeacon("/x")'), f"no-restricted-properties: 'navigator.sendBeacon' is restricted from being used. {net}"),
            ("features/__probe__/opfs.ts", reach("navigator.storage"), f"no-restricted-properties: 'navigator.storage' is restricted from being used. {net}"),
            # The worker's folder keeps fetch and caches, nothing else of the network or storage (F395).
            ("sw/__probe__/sw_caches.ts", reach('caches.open("x")'), None),
            ("sw/__probe__/sw_storage.ts", reach("localStorage"), f"no-restricted-globals: Unexpected use of 'localStorage'. {net}"),
            ("sw/__probe__/sw_cookie.ts", reach("document.cookie"), f"no-restricted-properties: 'document.cookie' is restricted from being used. {net}"),
            ("features/__probe__/html_too.ts", "export function put(box: HTMLElement): void {\n  box.innerHTML = \"x\";\n}\n", restricted("'innerHTML'")),
            ("features/__probe__/stubbed.test.ts", 'import { expect, test } from "vitest";\n\ntest("x", () => {\n  expect(typeof fetch).toBe("function");\n});\n', None),
            # A test may read another feature's parts, by a path inside the repository wherever node_modules sits.
            ("features/__probe__/peeks.test.ts", 'import { expect, test } from "vitest";\nimport { UpdatePrompt } from "../update/UpdatePrompt.tsx";\n\ntest("x", () => {\n  expect(UpdatePrompt).toBeDefined();\n});\n', None),
            ("lib/__probe__/lib_fetch.ts", reach('fetch("/x")'), None),
            # lib is the boundaries: core, Zod, the schemas; never React, the design system, a feature, the scene,
            # a route or the store (docs/ARCHITECTURE.md, slice 4's 4a).
            ("lib/__probe__/lib_core.ts", uses(name="parseLine", path="@gnoworld/core"), None),
            ("lib/__probe__/lib_zod.ts", 'import { z } from "zod";\n\nexport const used: unknown = z;\n', None),
            ("lib/__probe__/lib_react.ts", uses(name="useState", path="react"), "no-restricted-imports"),
            ("lib/__probe__/lib_router.ts", uses(name="Link", path="react-router"), "no-restricted-imports"),
            ("lib/__probe__/lib_ui.ts", uses(name="Button", path="@gnoworld/ui"), "no-restricted-imports"),
            ("lib/__probe__/lib_zustand.ts", uses(name="createStore", path="zustand/vanilla"), "no-restricted-imports"),
            ("lib/__probe__/lib_feature.ts", uses(name="UpdatePrompt", path="../../features/update/index.ts"), "import-x/no-restricted-paths"),
            ("lib/__probe__/lib_store.ts", uses(name="globe", path="../../store/__probe__/store_clean.ts"), "import-x/no-restricted-paths"),
            ("lib/__probe__/lib_scene.ts", uses(name="globe", path="../../scene/__probe__/globe.ts"), "import-x/no-restricted-paths"),
            ("lib/__probe__/lib_route.ts", uses(name="globe", path="../../routes/__probe__/route_clean.ts"), "import-x/no-restricted-paths"),
            ("lib/__probe__/lib_ui_path.ts", uses(name="Button", path="../../../../packages/ui/src/index.ts"), "import-x/no-restricted-paths"),
            # store holds the state: zustand's vanilla store, core, lib; never React (zustand's own hooks
            # included), the design system, a feature, the scene or a route; nor the network.
            ("store/__probe__/store_clean.ts", 'import { createStore } from "zustand/vanilla";\n\nexport const globe = createStore(() => ({ n: 1 }));\n', None),
            ("store/__probe__/store_lib.ts", uses(name="connect", path="../../lib/adena/adena.ts"), None),
            ("store/__probe__/store_core.ts", uses(name="parseLine", path="@gnoworld/core"), None),
            ("store/__probe__/store_react.ts", uses(name="useState", path="react"), "no-restricted-imports"),
            ("store/__probe__/store_zustand_react.ts", uses(name="create", path="zustand"), "no-restricted-imports"),
            ("store/__probe__/store_zustand_hook.ts", uses(name="useStore", path="zustand/react"), "no-restricted-imports"),
            ("store/__probe__/store_ui.ts", uses(name="Button", path="@gnoworld/ui"), "no-restricted-imports"),
            ("store/__probe__/store_feature.ts", uses(name="UpdatePrompt", path="../../features/update/index.ts"), "import-x/no-restricted-paths"),
            ("store/__probe__/store_scene.ts", uses(name="globe", path="../../scene/__probe__/globe.ts"), "import-x/no-restricted-paths"),
            ("store/__probe__/store_route.ts", uses(name="globe", path="../../routes/__probe__/route_clean.ts"), "import-x/no-restricted-paths"),
            ("store/__probe__/store_fetch.ts", reach('fetch("/x")'), f"no-restricted-globals: Unexpected use of 'fetch'. {net}"),
            ("routes/__probe__/route_clean.ts", "export const globe = 1;\n", None),
            # A test of lib or the store may render what it checks: the rules hold their code, not their tests.
            ("lib/__probe__/lib_react.test.ts", 'import { useState } from "react";\nimport { expect, test } from "vitest";\n\ntest("x", () => {\n  expect(useState).toBeDefined();\n});\n', None),
            ("store/__probe__/store_react.test.ts", 'import { useState } from "react";\nimport { expect, test } from "vitest";\n\ntest("x", () => {\n  expect(useState).toBeDefined();\n});\n', None),
            ("routes/__probe__/route_log.ts", 'export function load(): void {\n  console.log("loaded");\n}\n', "no-console"),
            ("routes/__probe__/route_scene.ts", uses(name="globe", path="../../scene/__probe__/globe.ts"), "import-x/no-restricted-paths"),
            ("scene/__probe__/globe.ts", "export const globe = 1;\n", None),
            # The scene: core, the store and three; never React, the design system, a feature or a route (docs/ARCHITECTURE.md).
            ("scene/__probe__/scene_three.ts", uses(name="Color", path="three"), None),
            ("scene/__probe__/scene_core.ts", uses(name="parseLine", path="@gnoworld/core"), None),
            ("scene/__probe__/scene_store.ts", uses(name="globe", path="../../store/__probe__/store_clean.ts"), None),
            ("scene/__probe__/scene_react.ts", uses(name="useState", path="react"), "no-restricted-imports"),
            ("scene/__probe__/scene_react_dom.ts", uses(name="flushSync", path="react-dom"), "no-restricted-imports"),
            ("scene/__probe__/scene_router.ts", uses(name="Link", path="react-router"), "no-restricted-imports"),
            ("scene/__probe__/scene_zustand_react.ts", uses(name="useStore", path="zustand/react"), "no-restricted-imports"),
            ("scene/__probe__/scene_zustand.ts", uses(name="create", path="zustand"), "no-restricted-imports"),
            ("scene/__probe__/scene_lib.ts", uses(name="savesData", path="../../lib/saveData.ts"), "import-x/no-restricted-paths"),
            ("scene/__probe__/scene_fetch.ts", reach('fetch("/x")'), f"no-restricted-globals: Unexpected use of 'fetch'. {net}"),
            ("scene/__probe__/scene_storage.ts", reach("localStorage"), f"no-restricted-globals: Unexpected use of 'localStorage'. {net}"),
            ("scene/__probe__/scene_ui.ts", uses(name="Button", path="@gnoworld/ui"), "no-restricted-imports"),
            ("scene/__probe__/scene_reaches_ui.ts", uses(name="Button", path="../../../../packages/ui/src/index.ts"), "import-x/no-restricted-paths"),
            ("scene/__probe__/scene_feature.ts", uses(name="UpdatePrompt", path="../../features/update/index.ts"), "import-x/no-restricted-paths"),
            ("scene/__probe__/scene_route.ts", uses(name="globe", path="../../routes/__probe__/route_clean.ts"), "import-x/no-restricted-paths"),
            # What runs on a frame makes nothing: a method, a private one, a field's arrow; each way of making, each alone.
            *[(f"scene/__probe__/frame_{name}.ts", onframe(body), FRAME) for name, body in (
                ("new", "return new Date();"),
                ("array", "return [list];"),
                ("object", "return { list };"),
                ("template", "return `${list.length.toString()}`;"),
                ("spread", "return Math.max(...list);"),
                ("closure", "return () => list;"),
                ("function", "return function kept() {\n      return list;\n    };"),
                ("class", "return class {};"),
                ("map", "return list.map(String);"),
                ("filter", "return list.filter(Boolean);"),
                ("slice", "return list.slice(1);"),
                ("concat", "return list.concat(list);"),
                ("flatMap", "return list.flatMap(String);"),
                ("reduce", "return list.reduce(Math.max);"),
                ("forEach", "list.forEach(String);"),
                ("sort", "return list.sort();"),
                ("toSorted", "return list.toSorted();"),
                ("join", "return list.join();"),
                ("split", "return String(list).split(String());"),
                ("bind", "return String.bind(list);"),
                ("clone", "return (list as unknown as { clone(): unknown }).clone();"),
                ("from", "return Array.from(list);"),
                ("assign", "return Object.assign(list);"),
                ("keys", "return Object.keys(list);"),
                ("values", "return Object.values(list);"),
                ("entries", "return Object.entries(list);"),
                ("stringify", "return JSON.stringify(list);"),
                ("for_of", "for (const each of list) this.seen = each;"),
                ("destructured", "const [first] = list;\n    return first;"),
            )],
            ("scene/__probe__/frame_rest.ts", "export class Loop {\n  draw(...list: number[]): number {\n    return list.length;\n  }\n}\n", FRAME),
            ("scene/__probe__/frame_private.ts", "export class Loop {\n  #kept = 0;\n\n  #tick(): number[] {\n    this.#kept += 1;\n    return [this.#kept];\n  }\n\n  run(): number[] {\n    return this.#tick();\n  }\n}\n", FRAME),
            ("scene/__probe__/frame_field.ts", "export class Loop {\n  readonly #draw = (): number[] => {\n    return [1];\n  };\n\n  run(): number[] {\n    return this.#draw();\n  }\n}\n", FRAME),
            ("scene/__probe__/frame_field_closure.ts", "export class Loop {\n  readonly #draw = () => () => 1;\n\n  run(): () => number {\n    return this.#draw();\n  }\n}\n", FRAME),
            ("scene/__probe__/frame_plain.ts", onframe("this.seen = list.length * 2;"), None),
            ("scene/__probe__/frame_setup.ts", "export class Loop {\n  readonly kept = [1];\n\n  build(): number[] {\n    return [...this.kept];\n  }\n}\n", None),
            ("scene/__probe__/frame_tested.test.ts", 'import { expect, test } from "vitest";\n\nconst draw = () => [1];\n\ntest("x", () => {\n  expect(draw()).toEqual([1]);\n});\n', None),
            # A page's own `draw` is no frame of the scene.
            ("features/__probe__/frame_elsewhere.ts", onframe("this.seen = [list].length;"), None),
            # The block replaces the root's list: what that holds still holds in the scene.
            ("scene/__probe__/scene_log_catch.ts", dict((n, c) for n, c, _ in LINT)["log_catch.ts"], "no-restricted-syntax: A catch that only logs"),
            ("scene/__probe__/scene_class_at_end.ts", dict((n, c) for n, c, _ in LINT)["class_at_end.ts"], "no-restricted-syntax: A character class right before"),
            *[(f"scene/__probe__/frame_is_{name}.ts", f"export class Part {{\n  {name}(): number[] {{\n    return [1];\n  }}\n}}\n", FRAME) for name in FRAME_NAMES],
        ]
        lint_cases(app, src, "app folders")
        os.remove(f"{src}/probe_root_fetch.ts")
        for folder in ("sw", "features", "lib", "store", "routes", "scene"):
            shutil.rmtree(f"{src}/{folder}/__probe__")
            if not os.listdir(f"{src}/{folder}"):
                os.rmdir(f"{src}/{folder}")

    if part("server"):
        # The server's folder (docs/ARCHITECTURE.md): core, schemas, Node and its framework, never the
        # browser's code, by name or by path; fetch only in net.ts and the tests; console nowhere; and the
        # typed rules reach it through its own tsconfig.
        src = "server/src/__probe__"
        uses = 'import {{ {name} }} from "{path}";\n\nexport const used: unknown = {name};\n'.format
        lint = dict((n, c) for n, c, _ in LINT)
        server = [
            ("framework.ts", uses(name="Hono", path="hono"), None),
            ("node.ts", uses(name="readFileSync", path="node:fs"), None),
            ("workspace.ts", uses(name="parseLine", path="@gnoworld/core"), None),
            ("schemas.ts", uses(name="ApiError", path="@gnoworld/schemas"), None),
            ("sibling.ts", uses(name="used", path="./framework.ts"), None),
            # A name that only starts like a banned one is another package.
            ("reactor.ts", uses(name="x", path="reactor"), None),
            *[(f"{name.replace('/', '_').replace('@', '')}.ts", uses(name="x", path=name), "no-restricted-imports")
              for name in ("react", "react-dom/client", "three", "@gnoworld/ui")],
            ("past_folder.ts", uses(name="Button", path="../../../packages/ui/src/index.ts"), "import-x/no-restricted-paths"),
            ("app_path.ts", uses(name="Layout", path="../../../app/src/root.tsx"), "import-x/no-restricted-paths"),
            ("fetch.ts", "export function load(): unknown {\n  return fetch(\"http://x\");\n}\n", "no-restricted-globals: Unexpected use of 'fetch'. The server reaches out"),
            ("calls.test.ts", 'import { expect, test } from "vitest";\n\ntest("x", () => {\n  expect(typeof fetch).toBe("function");\n});\n', None),
            ("console.ts", 'export function say(): void {\n  console.log("x");\n}\n', "no-console"),
            ("floating.ts", lint["floating.ts"], "@typescript-eslint/no-floating-promises"),
            ("log_catch.ts", lint["log_catch.ts"], "no-restricted-syntax: A catch that only logs"),
            ("module_map.ts", lint["module_map.ts"], MODULE),
            ("module_map.test.ts", 'import { expect, test } from "vitest";\n\nconst seen = new Map<string, number>();\n\ntest("x", () => {\n  expect(seen.size).toBe(0);\n});\n', None),
        ]
        lint_cases(server, src, "server")
        shutil.rmtree(src)
        # The one file that may reach out, as it is.
        out = run(["node_modules/.bin/eslint", "--no-cache", "--format", "json", "server/src/net.ts"])
        expect(out.returncode == 0, "eslint server: net.ts calls fetch " + out.stdout[-300:])
        # The gate's typecheck reaches the server, with the flags and Node's types: the planted error alone.
        plant({"unchecked.ts": "export function first(a: number[]): string {\n  return a[0].toFixed();\n}\n"}, where=src)
        out = run(["sh", "-c", f'PATH="$PWD/node_modules/.bin:$PATH" {SCRIPTS["typecheck"]}'])
        errors = [line for line in out.stdout.splitlines() if "error TS" in line]
        expect(len(errors) == 1 and "__probe__/unchecked.ts" in errors[0] and "possibly 'undefined'" in errors[0], f"tsc refuses an unchecked index in the server, and only it: {errors[:3]}")
        shutil.rmtree(src)
        # Vitest finds the server's tests.
        plant({"found.test.ts": 'import { expect, test } from "vitest";\n\ntest("server probe found", () => {\n  expect(1).toBe(2);\n});\n'}, where=src)
        out = run(["node_modules/.bin/vitest", "run", src])
        expect(out.returncode != 0 and "server probe found" in out.stdout + out.stderr, "vitest runs the server's tests")
        shutil.rmtree(src)

    if part("react_warn"):
        # Several of the app's rules only warn: the lint script must fail on a warning.
        plant({"warned.tsx": 'import { forwardRef } from "react";\n\nexport const Card = forwardRef<HTMLParagraphElement>(function Card(_, r) {\n  return <p ref={r} />;\n});\n'}, where=APP)
        out = run(["node_modules/.bin/eslint", *SCRIPTS["lint"].split()[1:-1], f"{APP}/warned.tsx"])
        expect(out.returncode != 0, "the lint script fails on a warning")
        shutil.rmtree(APP)

    if part("react_tsc"):
        # The compiler flags hold in the app too.
        plant({"unchecked.ts": "export function first(a: number[]): string {\n  return a[0].toFixed();\n}\n",
               "erasable.ts": "export enum Kind {\n  A,\n}\n"}, where=APP)
        # Through the typecheck script the gate runs, so its app half is proven with the flags.
        out = run(["sh", "-c", f'PATH="$PWD/node_modules/.bin:$PATH" {SCRIPTS["typecheck"]}'])
        expect("unchecked.ts" in out.stdout and "possibly 'undefined'" in out.stdout, "tsc refuses an unchecked index in the app")
        expect("erasable.ts" in out.stdout and "erasableSyntaxOnly" in out.stdout, "tsc refuses syntax Node cannot erase in the app")
        shutil.rmtree(APP)

    if part("ui_tsc"):
        # The design system is type-checked with the same flags, through the gate's own script.
        plant({"unchecked.ts": "export function first(a: number[]): string {\n  return a[0].toFixed();\n}\n"}, where=UI)
        out = run(["sh", "-c", f'PATH="$PWD/node_modules/.bin:$PATH" {SCRIPTS["typecheck"]}'])
        expect("unchecked.ts" in out.stdout and "possibly 'undefined'" in out.stdout, "tsc refuses an unchecked index in ui")
        shutil.rmtree(UI)

    if part("knip"):
        # knip: a file nothing imports.
        plant({"unused.ts": "export function lonely(): number {\n  return 1;\n}\n"})
        out = run(["node_modules/.bin/knip", "--no-progress"])
        expect(out.returncode != 0 and "__probe__/unused.ts" in out.stdout, "knip reports an unused file")
        shutil.rmtree(HERE)
        # In the server's workspace too.
        plant({"unused.ts": "export function lonely(): number {\n  return 1;\n}\n"}, where="server/src/__probe__")
        out = run(["node_modules/.bin/knip", "--no-progress"])
        expect(out.returncode != 0 and "server/src/__probe__/unused.ts" in out.stdout, "knip reports an unused file in the server")
        shutil.rmtree("server/src/__probe__")

    if part("jscpd"):
        # jscpd: the same block in two files.
        plant({f"copy_{x}.ts": f"export function sum_{x}(values: number[]): number {{\n  let total = 0;\n{BLOCK}  return total;\n}}\n" for x in "ab"})
        out = run(["node_modules/.bin/jscpd", HERE])
        expect(out.returncode != 0, "jscpd refuses a copied block")
        # git's own folder is no source: the hooks installed there are copies of the repository's (F129).
        os.makedirs(os.path.join(HERE, ".git"))
        os.rename(os.path.join(HERE, "copy_b.ts"), os.path.join(HERE, ".git", "copy_b.ts"))
        out = run(["node_modules/.bin/jscpd", HERE])
        expect(out.returncode == 0, "jscpd skips git's own folder")
        shutil.rmtree(HERE)

    if part("jscpd"):
        # jscpd's similarity: the same function with every name changed, or with a line added.
        shape = "export function {f}({v}: number[]): number {{\n  let {t} = 0;\n  for (const {x} of {v}) {{\n    if ({x} > 10) {{\n      {t} += {x} * 2;\n    }} else {{\n      {t} -= {x};\n    }}\n  }}\n  return {t};\n}}\n"
        plant({"one.ts": shape.format(f="alpha", v="values", t="total", x="v"), "two.ts": shape.format(f="beta", v="items", t="acc", x="item")})
        out = run(["node_modules/.bin/jscpd", HERE])
        expect(out.returncode != 0 and "one.ts" in out.stdout + out.stderr, "jscpd refuses a renamed copy")
        plant({"two.ts": shape.replace("-= ", "+= ").format(f="beta", v="items", t="acc", x="item").replace("> 10", ">= 10 && item < 99")})
        out = run(["node_modules/.bin/jscpd", HERE])
        expect(out.returncode == 0, "jscpd lets a function of another shape pass")
        plant({"two.ts": shape.replace("  return {t};", "  {t} += 1;\n  return {t};").format(f="beta", v="items", t="acc", x="item")})
        out = run(["node_modules/.bin/jscpd", HERE])
        expect(out.returncode != 0 and "one.ts" in out.stdout + out.stderr, "jscpd refuses a near copy (one line added), which scores under 0.9")
        shutil.rmtree(HERE)

    if part("comments"):
        # check_comments: short comments, none of the kinds that rot, no escape hatch; found by
        # TypeScript's own scanner, so a "//" in a string is no comment.
        body = "export function f(): number {\n  NOTE\n  return 1;\n}\n".replace
        comment_cases = {
            "a short header and a short note": ("// The file says what it is.\n" + body("NOTE", "// Why: the chain counts from one."), None),
            "a // inside a string": (body("NOTE", 'const url = "https://x.org/a // TODO b"; void url;'), None),
            "a six-line header under a shebang": ("#!/usr/bin/env node\n" + "".join(f"// line {i}\n" for i in range(6)) + body("NOTE", ""), None),
            "a note over three lines": (body("NOTE", "// one\n  // two\n  // three\n  // four"), "longer than 3 lines"),
            "a header over six lines": ("".join(f"// line {i}\n" for i in range(7)) + body("NOTE", ""), "header longer than 6 lines"),
            "a TODO": (body("NOTE", "// TODO: later"), "todo"),
            "an @todo in lower case": (body("NOTE", "// @todo later"), "todo"),
            "a TODO in a block after code": (body("NOTE", "const n = 1; /* todo: n */ void n;"), "todo"),
            "a banner": (body("NOTE", "// ==========="), "banner"),
            "numbered steps": (body("NOTE", "// 1. read the line"), "numbered step"),
            "an emoji": (body("NOTE", "// works 🚀"), "emoji"),
            "a coverage escape": (body("NOTE", "/* v8 ignore next */"), "escape hatch"),
            "a copy escape": (body("NOTE", "// jscpd:ignore-start"), "escape hatch"),
            "a mutation escape": (body("NOTE", "// Stryker disable next-line all"), "escape hatch"),
        }
        folder = tempfile.mkdtemp()
        for case, (content, word) in comment_cases.items():
            with open(os.path.join(folder, "f.ts"), "w") as f:
                f.write(content)
            out = run(["node", "scripts/check_comments.mjs", folder])
            said = (out.stdout + out.stderr).lower()
            expect(out.returncode == 0 if word is None else out.returncode != 0 and word in said, f"check_comments {case}")
        with open(os.path.join(folder, "f.ts"), "w") as f:
            f.write("")
        with open(os.path.join(folder, "s.css"), "w") as f:
            f.write("@layer x {\n  .a {\n    color: var(--c); /* TODO later */\n  }\n}\n")
        out = run(["node", "scripts/check_comments.mjs", folder])
        expect(out.returncode != 0 and "todo" in (out.stdout + out.stderr).lower(), "check_comments a TODO in CSS")
        os.remove(os.path.join(folder, "s.css"))
        os.makedirs(os.path.join(folder, "node_modules", "dep"))
        with open(os.path.join(folder, "node_modules", "dep", "index.js"), "w") as f:
            f.write("// TODO: a dependency's own business\n")
        out = run(["node", "scripts/check_comments.mjs", folder])
        expect(out.returncode == 0, "check_comments reads no node_modules outside a repository")
        # The staged copy borrows node_modules through links, which Node 24's recursive readdir
        # follows (3 million entries, 85 s): the walk enters no link, as git lists a link to a
        # folder and nothing in it; a link to a file it lists, and its text is read (F171).
        shutil.rmtree(os.path.join(folder, "node_modules"))
        elsewhere = tempfile.mkdtemp()
        with open(os.path.join(elsewhere, "g.ts"), "w") as f:
            f.write("// TODO: another tree's own business\n")
        os.symlink(elsewhere, os.path.join(folder, "node_modules"))
        os.symlink(elsewhere, os.path.join(folder, "linked"))
        out = run(["node", "scripts/check_comments.mjs", folder])
        expect(out.returncode == 0, "check_comments enters no link outside a repository, as git lists none of its files")
        os.symlink(os.path.join(elsewhere, "g.ts"), os.path.join(folder, "g.ts"))
        out = run(["node", "scripts/check_comments.mjs", folder])
        expect(out.returncode != 0 and "todo" in (out.stdout + out.stderr).lower(), "check_comments reads a linked file outside a repository, as git lists it")
        shutil.rmtree(folder)
        shutil.rmtree(elsewhere)

    if part("css"):
        # check_css: in a folder of its own, with its own tokens.
        css = tempfile.mkdtemp()
        tokens = ":root {\n  --p-grey: #eee;\n  --space-2: 0.5rem;\n  --color-text: var(--p-grey);\n  --radius-m: 8px;\n}\n"
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
            "a raw value in a private property": ({"Card.module.css": card(ok_decls + "  --_size: 13px;\n"), "Card.tsx": use("card")}, "raw value"),
            "a raw fallback in var()": ({"Card.module.css": card(ok_decls + "  margin-block: var(--space-2, 13px);\n"), "Card.tsx": use("card")}, "raw value"),
            "a colour by name": ({"Card.module.css": card(ok_decls + "  background: white;\n"), "Card.tsx": use("card")}, "raw value"),
            "a length in ch": ({"Card.module.css": card(ok_decls + "  max-inline-size: 60ch;\n"), "Card.tsx": use("card")}, "raw value"),
            "display: block flex": ({"Card.module.css": card(ok_decls + "  display: block flex;\n"), "Card.tsx": use("card")}, "layout"),
            "display: FLEX": ({"Card.module.css": card(ok_decls + "  display: FLEX;\n"), "Card.tsx": use("card")}, "layout"),
            "a float": ({"Card.module.css": card(ok_decls + "  float: inline-start;\n"), "Card.tsx": use("card")}, "layout"),
            "an ID selector": ({"Card.module.css": card(ok_decls) + "#main {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card")}, "id selector"),
            "transition: all": ({"Card.module.css": card(ok_decls + "  transition: all var(--space-2);\n"), "Card.tsx": use("card")}, "transition"),
            "a brace in a string hiding layout": ({"Card.module.css": card(ok_decls + '  --_mark: "}}";\n  display: flex;\n'), "Card.tsx": use("card")}, "layout"),
            "a raw value in a plain stylesheet": ({"base.css": "body {\n  color: #fff;\n}\n", "Card.module.css": card(ok_decls), "Card.tsx": use("card")}, "raw value"),
            "a class named by its square brackets": ({"Card.module.css": card(ok_decls), "Card.tsx": "import styles from './Card.module.css';\nexport const c = styles[\"card\"];\n"}, None),
            "a class the component names but its module lacks": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card", "title")}, "missing class"),
            "a missing class named by its square brackets": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const t = styles[\"title\"];\n"}, "missing class"),
            "a primitive read outside the token file": ({"Card.module.css": card(ok_decls + "  outline-color: var(--p-grey);\n"), "Card.tsx": use("card")}, "primitive"),
            "a primitive named in a component": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const p = \"--p-grey\";\n"}, "primitive"),
            "a primitive named in single quotes": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const p = '--p-grey';\n"}, "primitive"),
            "a primitive named in a template": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const p = `--p-grey`;\n"}, "primitive"),
            "a primitive read in a plain stylesheet": ({"base.css": "body {\n  color: var(--p-grey);\n}\n", "Card.module.css": card(ok_decls), "Card.tsx": use("card")}, "primitive"),
            "a primitive in a var() fallback": ({"Card.module.css": card(ok_decls + "  outline-color: var(--color-text, var(--p-grey));\n"), "Card.tsx": use("card")}, "primitive"),
            "a class only a comment of its folder names": ({"Card.module.css": card(ok_decls) + ".extra {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card") + "// styles.extra went with the old header\nexport const label = \"extra\";\n"}, "unused class"),
            "a token only a test names": ({"Card.module.css": card("  padding: var(--space-2);\n  color: var(--color-text);\n"), "Card.tsx": use("card"), "Card.test.tsx": "export const r = \"--radius-m\";\n"}, "unused token"),
            "a test names a primitive": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card"), "Card.test.tsx": "export const p = \"--p-grey\";\n"}, None),
            "a token that only starts like a primitive": ({"tokens.css": tokens.replace("}", "  --page-width: 10px;\n}"), "Card.module.css": card(ok_decls + "  max-inline-size: var(--page-width);\n"), "Card.tsx": use("card")}, None),
            "a raw colour in a semantic token": ({"tokens.css": tokens.replace("var(--p-grey)", "#eee"), "Card.module.css": card(ok_decls), "Card.tsx": use("card")}, "made of primitives"),
            "a second token file": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card"), "app/tokens.css": ":root {\n  --color-mine: #5cf2c8;\n}\n"}, "second token file"),
            "a class inside a layer and a container query": ({"Card.module.css": "@layer components {\n  @container (inline-size > 1px) {\n" + card(ok_decls) + "  }\n}\n", "Card.tsx": use("card")}, None),
            "a kebab class named in camel case": ({"Card.module.css": card(ok_decls) + ".card-title {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card", "cardTitle")}, "missing class"),
            "a kebab class named by its brackets": ({"Card.module.css": card(ok_decls) + ".card-title {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card") + "export const t = styles[\"card-title\"];\n"}, None),
            "a module bound to another name": ({"Card.module.css": card(ok_decls), "Card.tsx": "import css from './Card.module.css';\nexport const c = css.card;\nexport const t = css.title;\n"}, "missing class"),
            "a missing class in single-quoted brackets": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const t = styles['title'];\n"}, "missing class"),
            "a class named only in a CSS comment": ({"Card.module.css": "/* .title */\n" + card(ok_decls), "Card.tsx": use("card", "title")}, "missing class"),
            "a computed class": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "declare const v: string;\nexport const t = styles[v];\n"}, "computed"),
            "a destructured module": ({"Card.module.css": card(ok_decls), "Card.tsx": "import styles from './Card.module.css';\nexport const { card } = styles;\n"}, "destructured"),
            "a member of something else named styles": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "declare const theme: { styles: { title: string } };\nexport const t = theme.styles.title;\n"}, None),
            "a class only in the sibling module": ({"Card.module.css": card(ok_decls), "Tile.module.css": ".title {\n  color: var(--color-text);\n}\n", "Tile.tsx": "import styles from './Tile.module.css';\nexport const t = styles.title;\n", "Card.tsx": use("card", "title")}, "missing class"),
            "a module read from another folder": ({"Button/Button.module.css": card(ok_decls), "Button/Button.tsx": use("card").replace("./Card", "./Button"), "Icon/Icon.tsx": "import button from '../Button/Button.module.css';\nexport const c = button.card;\n"}, None),
            "a missing class of a module from another folder": ({"Button/Button.module.css": card(ok_decls), "Button/Button.tsx": use("card").replace("./Card", "./Button"), "Icon/Icon.tsx": "import button from '../Button/Button.module.css';\nexport const s = button.square;\n"}, "missing class"),
            "a state attribute no component sets": ({"Card.module.css": card(ok_decls) + ".card[data-spacing=\"s\"] {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card") + "export const a = <div data-space=\"s\" />;\n"}, "no component sets"),
            "a state attribute its component sets as an object's key": ({"Card.module.css": card(ok_decls) + ".card[data-space=\"s\"] {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card") + "export const a = { \"data-space\": \"s\" };\n"}, None),
            "a state attribute its component sets": ({"Card.module.css": card(ok_decls) + ".card[data-space=\"s\"] {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card") + "export const a = <div data-space=\"s\" />;\n"}, None),
            "a primitive read through var() in a component": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const s = { color: \"var(--p-grey)\" };\n"}, "primitive"),
            "an unknown token read in a component": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const s = { color: \"var(--nope)\" };\n"}, "unknown token"),
            "a token read only by a component's var()": ({"Card.module.css": card("  padding: var(--space-2);\n  color: var(--color-text);\n"), "Card.tsx": use("card") + "export const s = { borderRadius: \"var(--radius-m)\" };\n"}, None),
            "a token named only in a CSS comment": ({"Card.module.css": "/* var(--radius-m) */\n" + card("  padding: var(--space-2);\n  color: var(--color-text);\n"), "Card.tsx": use("card")}, "unused token"),
            "a token named only in a code comment": ({"Card.module.css": card("  padding: var(--space-2);\n  color: var(--color-text);\n"), "Card.tsx": use("card") + "// it read \"--radius-m\"\n"}, "unused token"),
            "a token defined only in a comment": ({"tokens.css": tokens.replace("}", "  /* --ghost: 1px; */\n}"), "Card.module.css": card(ok_decls + "  outline-width: var(--ghost);\n"), "Card.tsx": use("card")}, "unknown token"),
            "a state set only in a code comment": ({"Card.module.css": card(ok_decls) + ".card[data-spacing=\"s\"] {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card") + "// data-spacing=\"s\" went\n"}, "no component sets"),
            "a state set only by a test": ({"Card.module.css": card(ok_decls) + ".card[data-spacing=\"s\"] {\n  color: var(--color-text);\n}\n", "Card.tsx": use("card"), "Card.test.tsx": "export const a = <div data-spacing=\"s\" />;\n"}, "no component sets"),
            "a token only a journey names": ({"Card.module.css": card("  padding: var(--space-2);\n  color: var(--color-text);\n"), "Card.tsx": use("card"), "card.spec.ts": "export const r = \"--radius-m\";\n"}, "unused token"),
            "a primitive after a string that holds //": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card") + "export const u = \"a//b\", p = \"--p-grey\";\n"}, "primitive"),
            "copied rules": ({"Card.module.css": card(ok_decls), "Card.tsx": use("card"), "Tile.module.css": ".tile {\n" + ok_decls + "}\n", "Tile.tsx": "import styles from './Tile.module.css';\nexport const tile = styles.tile;\n"}, "copied"),
        }
        for n, (case, (files, word)) in enumerate(cases.items()):
            if ONLY and failures:
                break  # harness_mutate needs one failure, and the rest cost seconds per mutant
            # A folder named by number: check_css prints paths, and a case's title in one would
            # hold the very word the case waits for (the destructured case passed with its rule off).
            root = os.path.join(css, f"case{n}")
            plant({"tokens.css": tokens, **files}, where=os.path.join(root, "ui"))
            out = run([sys.executable, "-I", "scripts/check_css.py", root])
            said = (out.stdout + out.stderr).lower()
            expect(out.returncode == 0 if word is None else out.returncode != 0 and word in said, f"check_css {case}")
        shutil.rmtree(css)

finally:
    shutil.rmtree(HERE, ignore_errors=True)
    shutil.rmtree("packages/probe", ignore_errors=True)
    shutil.rmtree(UI, ignore_errors=True)
    shutil.rmtree(AVATAR, ignore_errors=True)
    shutil.rmtree(FIELD, ignore_errors=True)
    shutil.rmtree(APP, ignore_errors=True)
    shutil.rmtree(".vitest-attachments", ignore_errors=True)  # a browser test's screenshots, should a guard fail

if ONLY - ran:
    failures.append(f"ONLY names no block: {', '.join(sorted(ONLY - ran))}")
if failures:
    print("\nprobe: proposed fixes")
    for what in failures:
        if "expected nothing" in what or "lets" in what:
            print(f"  {what}\n    → a clean case is refused: a guard misfires; narrow it, or fix the case")
        else:
            print(f"  {what}\n    → the guard is off or broken, or the case no longer plants its fault: fix the guard first")
    sys.exit(f"probe: {len(failures)} of the harness's promises do not hold")
print("probe: every planted fault was caught")
