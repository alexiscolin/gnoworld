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
    ("pending.test.ts", 'import { expect, test } from "vitest";\n\ntest.fails("x", () => {\n  expect(1).toBe(2);\n});\n', None),
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
    ("token_elsewhere.css", "@layer components {\n  .a {\n    color: var(--color-text);\n  }\n}\n", None),
    ("invalid.css", "@layer components {\n  .a {\n    color: 12px;\n  }\n}\n", "css/no-invalid-properties"),
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
# ONLY=<block>[,<block>...] runs only those blocks: harness_mutate runs the one a guard belongs to.
ONLY = set(filter(None, os.environ.get("ONLY", "").split(",")))
ran = set()


def part(name):
    """Whether this block runs: all of them, unless ONLY names some."""
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


def expect(ok, what):
    print(("ok    " if ok else "FAIL  ") + what)
    if not ok:
        failures.append(what)


try:
    if part("lint"):
        # ESLint: one run over every planted file, then each file must carry its rule.
        plant({name: content for name, content, _ in LINT})
        out = run(["node_modules/.bin/eslint", "--no-cache", "--format", "json", HERE])
        try:
            report = {os.path.basename(r["filePath"]): reported(r["messages"]) for r in json.loads(out.stdout)}
        except ValueError:
            report = {}
            expect(False, "eslint ran: " + (out.stderr or out.stdout)[-300:])
        for name, _, rule in LINT:
            got = report.get(name, set())
            expect(got == set() if rule is None else carries(got, rule), f"eslint {name}: expected {rule or 'nothing'}, got {sorted(map(str, got))}")
        shutil.rmtree(HERE)

    if part("vitest"):
        # Vitest: a test that asserts nothing fails (expect.requireAssertions).
        plant({"empty.test.ts": 'import { test } from "vitest";\n\ntest("x", () => {});\n'})
        out = run(["node_modules/.bin/vitest", "run", f"{HERE}/empty.test.ts"])
        expect(out.returncode != 0 and "assertion" in (out.stdout + out.stderr).lower(), "vitest refuses a test with no assertion")
        shutil.rmtree(HERE)

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
        # Outside core: `fails` is refused (pairing happens only in core), and a swallowed error too.
        other = "packages/probe/src"
        plant({"pending.test.ts": 'import { expect, test } from "vitest";\n\ntest.fails("x", () => {\n  expect(1).toBe(2);\n});\n',
               "log_catch.ts": dict((n, c) for n, c, _ in LINT)["log_catch.ts"]}, where=other)
        out = run(["node_modules/.bin/eslint", "--no-cache", "-f", "json", other])
        report = {os.path.basename(r["filePath"]): reported(r["messages"]) for r in json.loads(out.stdout or "[]")}
        for name, rule in (("pending.test.ts", "no-restricted-syntax: `fails` is for pairing"), ("log_catch.ts", "no-restricted-syntax: A catch that only logs")):
            got = report.get(name, set())
            expect(carries(got, rule), f"eslint outside core {name}: expected {rule}, got {sorted(map(str, got))}")
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

        def banned(name):
            return f"no-restricted-imports: '{name}' import from 'react' is restricted. The React Compiler memoizes"

        def restricted(name):
            return f"no-restricted-properties: {name} is restricted from being used. Nothing reaches the DOM as HTML"
        react = [
            ("clean.tsx", component(body="  return <p>{n}</p>;\n"), None),
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
            ("adjacent_html.tsx", ref('boxRef.current.insertAdjacentHTML("beforeend", String(n));'), restricted("'insertAdjacentHTML'")),
            ("document_write.tsx", ref("document.write(String(n));"), restricted("'document.write'")),
            ("leaked.tsx", component(body="  return <div>{n && <p>{n}</p>}</div>;\n"), "@eslint-react/no-leaked-conditional-rendering"),
            ("index_key.tsx", component(body="  return <ul>{[n].map((v, i) => <li key={i}>{v}</li>)}</ul>;\n"), "@eslint-react/no-array-index-key"),
            ("missing_key.tsx", component(body="  return <ul>{[n].map((v) => <li>{v}</li>)}</ul>;\n"), "@eslint-react/no-missing-key"),
            ("script_url.tsx", component(body='  return <a href="javascript:void(0)">{n}</a>;\n'), "@eslint-react/dom-no-script-url"),
            ("blank.tsx", component(body='  return <a href="https://gno.land" target="_blank">{n}</a>;\n'), "@eslint-react/dom-no-unsafe-target-blank"),
            ("fixme.spec.ts", 'import { test } from "@playwright/test";\n\ntest.fixme("x", () => {});\n', off),
            ("expected_fail.spec.ts", 'import { test } from "@playwright/test";\n\ntest.fail("x", () => {});\n', off),
            ("skipped.spec.ts", 'import { test } from "@playwright/test";\n\ntest.describe.skip("x", () => {});\n', off),
        ]
        app = "app/src/__probe__"
        plant({name: content for name, content, _ in react}, where=app)
        out = run(["node_modules/.bin/eslint", "--no-cache", "--format", "json", app])
        try:
            report = {os.path.basename(r["filePath"]): reported(r["messages"]) for r in json.loads(out.stdout)}
        except ValueError:
            report = {}
            expect(False, "eslint ran on the app: " + (out.stderr or out.stdout)[-300:])
        for name, _, rule in react:
            got = report.get(name, set())
            expect(got == set() if rule is None else carries(got, rule), f"eslint app {name}: expected {rule or 'nothing'}, got {sorted(map(str, got))}")
        # Several of these rules only warn: the lint script must fail on a warning.
        with open("package.json") as f:
            lint = json.load(f)["scripts"]["lint"].split()
        out = run(["node_modules/.bin/eslint", *lint[1:-1], f"{app}/forward_ref.tsx"])
        expect(out.returncode != 0, "the lint script fails on a warning")
        shutil.rmtree(app)
        # The compiler flags hold in the app too.
        plant({"unchecked.ts": "export function first(a: number[]): string {\n  return a[0].toFixed();\n}\n",
               "erasable.ts": "export enum Kind {\n  A,\n}\n"}, where=app)
        # Through the typecheck script the gate runs, so its app half is proven with the flags.
        with open("package.json") as f:
            typecheck = json.load(f)["scripts"]["typecheck"]
        out = run(["sh", "-c", f'PATH="$PWD/node_modules/.bin:$PATH" {typecheck}'])
        expect("unchecked.ts" in out.stdout and "possibly 'undefined'" in out.stdout, "tsc refuses an unchecked index in the app")
        expect("erasable.ts" in out.stdout and "erasableSyntaxOnly" in out.stdout, "tsc refuses syntax Node cannot erase in the app")
        shutil.rmtree(app)

    if part("knip"):
        # knip: a file nothing imports.
        plant({"unused.ts": "export function lonely(): number {\n  return 1;\n}\n"})
        out = run(["node_modules/.bin/knip", "--no-progress"])
        expect(out.returncode != 0 and "__probe__/unused.ts" in out.stdout, "knip reports an unused file")
        shutil.rmtree(HERE)

    if part("jscpd"):
        # jscpd: the same block in two files.
        plant({f"copy_{x}.ts": f"export function sum_{x}(values: number[]): number {{\n  let total = 0;\n{BLOCK}  return total;\n}}\n" for x in "ab"})
        out = run(["node_modules/.bin/jscpd", HERE])
        expect(out.returncode != 0, "jscpd refuses a copied block")
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
        shutil.rmtree(folder)

    if part("css"):
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
    shutil.rmtree("packages/probe", ignore_errors=True)
    shutil.rmtree("app/src/__probe__", ignore_errors=True)

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
