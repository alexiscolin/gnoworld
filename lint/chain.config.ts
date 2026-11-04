// The chain-read package (D112): the boundary every chain read crosses, for the app, the server and Jarvis, held as the app's
// lib was before the reads moved here: core, Zod and the schemas, never React, the design system or the store; console
// nowhere. A part of the lint config, which eslint.config.ts composes.
import { defineConfig } from "eslint/config";
import { TESTS } from "./shared.config.ts";

const CHAIN =
  "The chain package reads with core, Zod and the schemas: never React, the design system or the store (D112).";

export default defineConfig({
  files: ["packages/chain/**/*.ts"],
  ignores: TESTS,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { regex: "^(react|react-dom|react-router|@gnoworld/ui)(/|$)", message: CHAIN },
          { regex: "^zustand(/|$)", message: CHAIN },
        ],
      },
    ],
    "no-console": "error",
  },
});
