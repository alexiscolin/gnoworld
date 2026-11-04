// The lint half of the gate (docs/ARCHITECTURE.md, "TypeScript" and "Which way dependencies
// point"; docs/DESIGN-SYSTEM.md, "CSS rules"). scripts/probe.py proves each promise holds. Each
// part under lint/ holds an area's rules; this file composes them, in an order where no part's
// rule replaces another's on the same files.
import css from "@eslint/css";
import { defineConfig, globalIgnores, includeIgnoreFile } from "eslint/config";
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";
import app from "./lint/app.config.ts";
import chain from "./lint/chain.config.ts";
import core from "./lint/core.config.ts";
import gnoworld from "./lint/gnoworld.config.ts";
import react from "./lint/react.config.ts";
import server from "./lint/server.config.ts";
import { BENCHES, CLASS_AT_END, MODULE_STATE, SWALLOWED, SWITCHED_OFF, TESTS } from "./lint/shared.config.ts";

const BASELINE_ALSO = { allowAtRules: ["starting-style"], allowSelectors: ["popover-open"] };
const BOX = { ...BASELINE_ALSO, allowProperties: ["field-sizing", "resize"] };
const FACE = { ...BASELINE_ALSO, allowProperties: ["forced-color-adjust"] };

export default defineConfig(
  includeIgnoreFile(`${import.meta.dirname}/.gitignore`),
  // Workflow scripts are bodies Claude Code runs, with an export and a return at their top: no JavaScript parser reads them.
  globalIgnores(["docs/", "gno/", ".claude/workflows/"]),
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
      "no-restricted-syntax": ["error", ...SWALLOWED, CLASS_AT_END],
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
  // Config files run on Node, whose types core must not see: lint them without types.
  { files: ["*.config.ts", "app/*.config.ts", "lint/*.config.ts"], extends: [tseslint.configs.disableTypeChecked] },
  // No state at a module's top in a workspace's source; core's and ui's own lists, below, hold it too, and the
  // tests' lists replace it.
  {
    files: ["server/src/**/*.ts", "jarvis/src/**/*.ts", "packages/*/src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...SWALLOWED, CLASS_AT_END, MODULE_STATE] },
  },
  react,
  app,
  server,
  chain,
  gnoworld,
  {
    // Tests read as lists of cases, so they may run long.
    files: TESTS,
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "no-restricted-syntax": ["error", ...SWALLOWED, CLASS_AT_END, SWITCHED_OFF],
    },
  },
  core,
  {
    // A bench is switched off like a test (security-S1). Last, since a later no-restricted-syntax replaces an earlier
    // one's: the list every other file of the app has, and no bench of core, the server or the design system exists.
    files: BENCHES,
    rules: { "no-restricted-syntax": ["error", ...SWALLOWED, CLASS_AT_END, SWITCHED_OFF] },
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
      // @starting-style, from 2024, which a popover's fade in needs.
      "css/use-baseline": ["error", BASELINE_ALSO],
    },
  },
  // And forced-color-adjust, which only a picture takes, where forced colours exist: the avatar's face,
  // never a control (Alexis, F319; F349).
  { files: ["packages/ui/src/Avatar/**/*.css"], rules: { "css/use-baseline": ["error", FACE] } },
  // And field-sizing and resize, which the box of lines grows and limits its handle by, in Field's folder alone (F1729).
  { files: ["packages/ui/src/Field/**/*.css"], rules: { "css/use-baseline": ["error", BOX] } },
  {
    // A module of the app, the services or the packages is TypeScript: one in another extension would pass the walls and
    // gnoworld/chain-read unread, which read .ts and .tsx (D123, F5277). Last, so no later list replaces it.
    files: [
      "{app/src,server,jarvis,packages/*/src}/**/*.{mts,cts,js,mjs,cjs,jsx}",
      // The services hold no JSX: a .tsx there would pass their walls unread (F5281).
      "{server,jarvis,packages/service}/**/*.tsx",
    ],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "A module of the product is TypeScript, .ts or .tsx: another extension passes the lint's walls unread (D123).",
        },
      ],
    },
  },
);
