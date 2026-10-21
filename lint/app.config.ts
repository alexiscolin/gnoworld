// The app's folders (docs/ARCHITECTURE.md, "Which way dependencies point"; F378): the worker imports
// only itself; a feature reaches another only through its index.ts; a route never imports the scene;
// the network and storage only in lib and the worker; console nowhere, until the logger. A part of the
// lint config, which eslint.config.ts composes.
import { readdirSync } from "node:fs";
import { defineConfig } from "eslint/config";
import { REACT_PROPERTIES } from "./react.config.ts";
import { TESTS } from "./shared.config.ts";

const SRC = "./app/src";
// Each feature's folder, read as the lint starts: a new feature gets its zone at once.
const FEATURES = readdirSync(new URL("../app/src/features", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const ALONE = "A feature reaches another only through its index.ts (docs/ARCHITECTURE.md).";
const SW = "The worker imports only sw: it runs alone, before the page.";
const REACHES = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
];
const NET = "The network and storage are lib's, and the worker's (docs/ARCHITECTURE.md).";

export default defineConfig(
  {
    // A test may reach what its code may not: vitest, another feature's parts.
    files: [`${SRC}/**/*.{ts,tsx}`],
    ignores: TESTS,
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: `${SRC}/sw`,
              from: "./",
              except: [`${SRC}/sw`],
              message: SW,
            },
            ...FEATURES.map((feature) => ({
              target: `${SRC}/features/${feature}`,
              from: `${SRC}/features`,
              except: [
                `./${feature}`,
                ...FEATURES.filter((other) => other !== feature).map((other) => `./${other}/index.ts`),
              ],
              message: ALONE,
            })),
            {
              target: `${SRC}/routes`,
              from: `${SRC}/scene`,
              message: "A route never imports the scene: the universe feature mounts it.",
            },
          ],
        },
      ],
      "no-console": "error",
    },
  },
  {
    // No package either, named in the import itself: where node_modules sits, the zone above cannot see.
    files: [`${SRC}/sw/**`],
    ignores: TESTS,
    rules: { "no-restricted-imports": ["error", { patterns: [{ regex: "^[^.]", message: SW }] }] },
  },
  {
    files: [`${SRC}/**/*.{ts,tsx}`],
    ignores: [`${SRC}/lib/**`, `${SRC}/sw/**`, ...TESTS],
    rules: {
      "no-restricted-globals": ["error", ...REACHES.map((name) => ({ name, message: NET }))],
      // React's own, which this rule replaces here, and the network's and storage's by their owners.
      "no-restricted-properties": [
        "error",
        ...REACT_PROPERTIES,
        ...["window", "globalThis", "self"].flatMap((object) =>
          REACHES.map((property) => ({ object, property, message: NET })),
        ),
        { object: "document", property: "cookie", message: NET },
      ],
    },
  },
);
