// The lint half of the gate (docs/ARCHITECTURE.md, "TypeScript" and "Which way dependencies
// point"; docs/DESIGN-SYSTEM.md, "CSS rules"). scripts/probe.py proves each promise holds.
import css from "@eslint/css";
import eslintReact from "@eslint-react/eslint-plugin";
import { defineConfig, globalIgnores, includeIgnoreFile } from "eslint/config";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// An error swallowed: a catch, or a promise's .catch, that only logs, returns nothing or does
// nothing. Shared, since a later block's no-restricted-syntax replaces an earlier one's.
const LOG =
  "CallExpression:matches([callee.object.name=/^(console|logger)$/], [callee.object.property.name=/^(console|logger)$/])";
const SWALLOWED = [
  {
    selector: `CatchClause > BlockStatement[body.length=1] > ExpressionStatement > ${LOG}`,
    message: "A catch that only logs swallows the error: act on it, or let it rise.",
  },
  {
    // esquery's :has never matches a relative selector of two steps (`:has(> A > B)`).
    selector: `CatchClause > BlockStatement[body.length=2] > ExpressionStatement:first-child:has(> ${LOG}) + ReturnStatement`,
    message: "A catch that logs, then returns a default, swallows the error: act on it, or let it rise.",
  },
  {
    selector:
      "CallExpression[callee.property.name='catch'] > :function[body.type='BlockStatement'][body.body.length=0]",
    message: "An empty .catch swallows the error.",
  },
  {
    selector:
      "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='Identifier'][body.name='undefined']",
    message: "A .catch that returns undefined swallows the error.",
  },
  {
    selector: `CallExpression[callee.property.name='catch'] > ArrowFunctionExpression > ${LOG}.body`,
    message: "A .catch that only logs swallows the error.",
  },
];
// No test is switched off or focused, so none stops guarding quietly (CLAUDE.md, "No regression").
const SWITCHED_OFF = {
  // Vitest's and Playwright's ways: skip, focus, leave for later, run on a condition, expect to fail.
  selector:
    "MemberExpression[property.name=/^(only|skip|todo|skipIf|runIf|fixme)$/], MemberExpression[property.name='fail']:not([object.name=/^(expect|assert)$/])",
  message: "A test is never switched off or focused: fix it, or remove it with `Removed-test:` in the commit.",
};
// Vitest's tests and Playwright's journeys.
const TESTS = ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"];
const BASELINE_ALSO = { allowSelectors: ["popover-open"], allowProperties: ["forced-color-adjust"] };
const RAW_ANCHOR = { selector: "JSXOpeningElement[name.name='a']", message: "A link in ui is an Anchor (F259)." };
const MEMOS = ["memo", "useMemo", "useCallback"];
const MEMO = "The React Compiler memoizes: no hand-written memo, useMemo or useCallback (docs/ARCHITECTURE.md).";
const HTML = "Nothing reaches the DOM as HTML: render it as React elements (docs/ARCHITECTURE.md, security).";
// core reaches no clock, network or global of its own: time and chance come in as parameters.
const IMPURE = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0], CallExpression[callee.name='Date']",
    message: "core takes the time as a parameter.",
  },
  { selector: "ImportExpression", message: "core imports only core, statically." },
  {
    selector: "TSDeclareFunction, VariableDeclaration[declare=true], TSModuleDeclaration[declare=true]",
    message: "core declares no ambient global: it would fake one.",
  },
];

export default defineConfig(
  includeIgnoreFile(`${import.meta.dirname}/.gitignore`),
  globalIgnores(["docs/", "gno/"]),
  // A rule is changed in this file, with its reason, never switched off in a comment.
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" } },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    plugins: { "import-x": importX },
    settings: {
      // import-x parses each imported file to follow cycles; imports name their `.ts` file.
      "import-x/extensions": [".ts", ".tsx"],
      "import-x/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
      "import-x/resolver-next": [importX.createNodeResolver()],
    },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Errors are handled where something can be done about them, or they rise.
      "no-empty": "error",
      "no-useless-catch": "error",
      "no-unsafe-finally": "error",
      "preserve-caught-error": ["error", { requireCatchParameter: true }],
      "no-restricted-syntax": ["error", ...SWALLOWED],
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // The type checker is never silenced, not even with a reason.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true },
      ],
      // No code built from strings (`new Function` is refused by the preset's no-implied-eval).
      "no-eval": "error",
      "import-x/no-cycle": "error",
      // Past these sizes, code splits into parts that compose.
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-params": "error",
    },
  },
  {
    // Config files run on Node, whose types core must not see: lint them without types.
    files: ["*.config.ts", "app/*.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // The app and the design system: React's hooks and the compiler's rules, and nothing from data
    // into the DOM as HTML (docs/ARCHITECTURE.md, "React" and the security checklist). Their warnings fail too.
    files: ["app/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"], eslintReact.configs["strict-type-checked"]],
    rules: {
      // A route answers "not found" by throwing React Router's data(); nothing else but an Error.
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "package", package: "react-router", name: "DataWithResponseInit" }] },
      ],
      "no-restricted-imports": ["error", { name: "react", importNames: MEMOS, message: MEMO }],
      "no-restricted-properties": [
        "error",
        ...MEMOS.map((property) => ({ object: "React", property, message: MEMO })),
        ...["innerHTML", "outerHTML", "insertAdjacentHTML"].map((property) => ({ property, message: HTML })),
        { object: "document", property: "write", message: HTML },
      ],
    },
  },
  {
    // React Router calls the server entry with four arguments; it runs only at build time.
    files: ["app/src/entry.server.tsx"],
    rules: { "max-params": ["error", 4] },
  },
  {
    // Tests read as lists of cases, so they may run long.
    files: TESTS,
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "no-restricted-syntax": ["error", ...SWALLOWED, SWITCHED_OFF],
    },
  },
  {
    // `fails` marks a test waiting for Alexis's code (pairing), which happens only in core.
    files: TESTS,
    ignores: ["packages/core/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...SWALLOWED,
        SWITCHED_OFF,
        { selector: "MemberExpression[property.name='fails']", message: "`fails` is for pairing in core only." },
      ],
    },
  },
  {
    // core: pure rules. It imports only itself, and time and chance come in as parameters.
    files: ["packages/core/**/*.{ts,tsx,mts,cts}"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^[^.]", message: "core imports only core (docs/ARCHITECTURE.md)." }] },
      ],
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            { target: "./packages/core", from: "./", except: ["./packages/core"], message: "core imports only core." },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "core takes the time as a parameter." },
        { object: "Math", property: "random", message: "core takes randomness as a parameter." },
        { object: "performance", property: "now", message: "core takes the time as a parameter." },
      ],
      "no-restricted-globals": ["error", "globalThis", "window", "document", "self", "fetch", "process"],
      "no-restricted-syntax": ["error", ...SWALLOWED, ...IMPURE],
      "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", path: "never", types: "never" }],
    },
  },
  {
    // ui: the design system imports only itself and its packages, never the app, core or a config.
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./packages/ui",
              from: "./",
              except: ["./packages/ui", "./node_modules"],
              message: "ui imports only ui (docs/ARCHITECTURE.md).",
            },
          ],
        },
      ],
    },
  },
  {
    // A link in ui is an Anchor (link.tsx), so the site's own paths go through the page's link and
    // never reload the app (F259, F317). Its stories, its tests and the overview's prose draw plain ones.
    files: ["packages/ui/src/**/*.tsx"],
    ignores: ["packages/ui/src/link.tsx", "packages/ui/src/Overview/**", "**/*.stories.tsx", ...TESTS],
    rules: { "no-restricted-syntax": ["error", ...SWALLOWED, RAW_ANCHOR] },
  },
  {
    files: ["**/*.css"],
    language: "css/css",
    plugins: { css },
    extends: [css.configs.recommended],
    rules: {
      // Tokens live in tokens.css: a module's var() names one defined elsewhere.
      "css/no-invalid-properties": ["error", { allowUnknownVariables: true }],
      "css/use-layers": "error",
      "css/prefer-logical-properties": "error",
      // docs/DESIGN-SYSTEM.md, "Browsers": Baseline widely available, but for the popover and
      // @starting-style, from 2024, which a popover's fade in needs, and forced-color-adjust, which only
      // a picture takes, and only where forced colours exist (Alexis, F319).
      "css/use-baseline": ["error", { allowAtRules: ["starting-style"], ...BASELINE_ALSO }],
    },
  },
);
