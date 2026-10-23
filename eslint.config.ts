// The lint half of the gate (docs/ARCHITECTURE.md, "TypeScript" and "Which way dependencies
// point"; docs/DESIGN-SYSTEM.md, "CSS rules"). scripts/probe.py proves each promise holds. Each
// part under lint/ holds an area's rules; this file composes them, in an order where no part's
// rule replaces another's on the same files.
import css from "@eslint/css";
import { defineConfig, globalIgnores, includeIgnoreFile } from "eslint/config";
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";
import app from "./lint/app.config.ts";
import core from "./lint/core.config.ts";
import react from "./lint/react.config.ts";
import server from "./lint/server.config.ts";
import { MODULE_STATE, SWALLOWED, SWITCHED_OFF, TESTS } from "./lint/shared.config.ts";

const BASELINE_ALSO = { allowAtRules: ["starting-style"], allowSelectors: ["popover-open"] };
const FACE = { ...BASELINE_ALSO, allowProperties: ["forced-color-adjust"] };

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
  // Config files run on Node, whose types core must not see: lint them without types.
  { files: ["*.config.ts", "app/*.config.ts", "lint/*.config.ts"], extends: [tseslint.configs.disableTypeChecked] },
  // No state at a module's top in a workspace's source; core's and ui's own lists, below, hold it too, and the
  // tests' lists replace it.
  {
    files: ["server/src/**/*.ts", "packages/*/src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...SWALLOWED, MODULE_STATE] },
  },
  react,
  app,
  server,
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
  core,
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
);
