// core's pure rules (docs/ARCHITECTURE.md): it imports only itself, and time and chance come in as
// parameters. A part of the lint config, which eslint.config.ts composes.
import { defineConfig } from "eslint/config";
import { CLASS_AT_END, MODULE_STATE, ON_A_FRAME, SWALLOWED } from "./shared.config.ts";

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

const PURE = ["error", ...SWALLOWED, CLASS_AT_END, ...IMPURE, MODULE_STATE];

export default defineConfig(
  {
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
      "no-restricted-syntax": PURE,
      "@typescript-eslint/triple-slash-reference": ["error", { lib: "never", path: "never", types: "never" }],
    },
  },
  {
    // What the scene's loop reaches in core: elsewhere a `field` or a `sample` is nobody's frame.
    files: ["packages/core/src/{frame,space}/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-restricted-syntax": [...PURE, ON_A_FRAME] },
  },
);
