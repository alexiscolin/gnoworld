// The chain-read package (D112): the boundary every chain read crosses, for the app, the server and Jarvis. It imports core,
// Zod and the schemas alone, never a workspace that imports it nor the service package, tests included; its code runs in the
// browser too, so no React, design system, store or Node module, and console nowhere. A part of the lint config, which
// eslint.config.ts composes; gnoworld.config.ts holds the rule that keeps a read's words in it.
import { defineConfig } from "eslint/config";
import { TESTS } from "./shared.config.ts";

const CHAIN =
  "The chain package reads with core, Zod and the schemas: never React, the design system, the store, Node or a workspace that imports it (D112).";
const APART = { regex: "^@gnoworld/(server|jarvis|app|service)(/|$)", message: CHAIN };

export default defineConfig(
  {
    files: ["packages/chain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [APART] }],
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./packages/chain",
              from: "./",
              except: ["./packages/chain", "./packages/core", "./packages/schemas", "./node_modules"],
              message: CHAIN,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/chain/**/*.ts"],
    ignores: TESTS,
    rules: {
      // The list above's entry, as a later list replaces an earlier one.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            APART,
            { regex: "^(react|react-dom|react-router|@gnoworld/ui)(/|$)", message: CHAIN },
            { regex: "^zustand(/|$)", message: CHAIN },
          ],
        },
      ],
      "import-x/no-nodejs-modules": "error",
      "no-console": "error",
    },
  },
);
