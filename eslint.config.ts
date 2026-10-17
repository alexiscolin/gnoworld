// The lint half of the gate (docs/ARCHITECTURE.md, "TypeScript" and "Which way dependencies
// point"; docs/DESIGN-SYSTEM.md, "CSS rules"). scripts/probe.py proves each promise holds.
import css from "@eslint/css";
import { defineConfig, globalIgnores } from "eslint/config";
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["**/node_modules/", "coverage/", "reports/", ".stryker-tmp/", ".claude/tmp/", "docs/", "gno/"]),
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
      parserOptions: { projectService: { allowDefaultProject: ["*.config.ts"] }, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Errors are handled where something can be done about them, or they rise.
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-useless-catch": "error",
      "preserve-caught-error": ["error", { requireCatchParameter: true }],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CatchClause > BlockStatement[body.length=1] > ExpressionStatement > CallExpression[callee.object.name=/^(console|logger)$/]",
          message: "A catch that only logs swallows the error: act on it, or let it rise.",
        },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // No code built from strings.
      "no-eval": "error",
      "no-new-func": "error",
      "import-x/no-cycle": "error",
      // Past these sizes, code splits into parts that compose.
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-params": ["error", 3],
    },
  },
  {
    // Config files run on Node, whose types core must not see: lint them without types.
    files: ["*.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Tests read as lists of cases, so they may run long.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "max-lines": "off", "max-lines-per-function": "off" },
  },
  {
    // core: pure rules. It imports only itself, and time and chance come in as parameters.
    files: ["packages/core/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^[^.]", message: "core imports only core (docs/ARCHITECTURE.md)." }] },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "core takes the time as a parameter." },
        { object: "Math", property: "random", message: "core takes randomness as a parameter." },
        { object: "performance", property: "now", message: "core takes the time as a parameter." },
      ],
    },
  },
  {
    files: ["**/*.css"],
    language: "css/css",
    plugins: { css },
    extends: [css.configs.recommended],
    rules: {
      "css/use-baseline": ["error", { available: "widely" }],
      "css/use-layers": "error",
      "css/prefer-logical-properties": "error",
      "css/no-important": "error",
    },
  },
);
