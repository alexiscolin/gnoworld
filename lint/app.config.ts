// The app's folders (docs/ARCHITECTURE.md, "Which way dependencies point"; F378): the worker imports
// only itself; a feature reaches another only through its index.ts; a route never imports the scene;
// lib and the store never React, the design system, a feature, the scene or a route (slice 4); the
// network and storage only in lib and the worker; console nowhere, until the logger. A part of the
// lint config, which eslint.config.ts composes.
import { readdirSync } from "node:fs";
import type { Linter } from "eslint";
import { defineConfig } from "eslint/config";
import { REACT_PROPERTIES } from "./react.config.ts";
import { SWALLOWED, TESTS } from "./shared.config.ts";

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
  "cookieStore",
];
const NET = "The network and storage are lib's; the worker's folder has fetch and caches (docs/ARCHITECTURE.md).";
const LIB =
  "lib is the boundaries: core, Zod, the schemas; never React, the design system, the store, a feature, the scene or a route.";
const STORE =
  "The store holds the state: core, lib, zustand/vanilla; never React, the design system, a feature, the scene or a route.";
// The packages that bring React or the design system, by their names: a zone sees only paths inside the repository.
const REACTS = "^(react|react-dom|react-router|@gnoworld/ui)(/|$)";
// The rules that ban these names, bare or through their owners, with the browser's other doors.
const reaching = (names: readonly string[]): Linter.RulesRecord => ({
  "no-restricted-globals": ["error", ...names.map((name) => ({ name, message: NET }))],
  // React's own, which this rule replaces here.
  "no-restricted-properties": [
    "error",
    ...REACT_PROPERTIES,
    ...["window", "globalThis", "self"].flatMap((object) =>
      names.map((property) => ({ object, property, message: NET })),
    ),
    { object: "document", property: "cookie", message: NET },
    { object: "navigator", property: "sendBeacon", message: NET },
    { object: "navigator", property: "storage", message: NET },
  ],
});

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
            {
              target: `${SRC}/lib`,
              from: [`${SRC}/features`, `${SRC}/scene`, `${SRC}/routes`, `${SRC}/store`, "./packages/ui"],
              message: LIB,
            },
            {
              target: `${SRC}/store`,
              from: [`${SRC}/features`, `${SRC}/scene`, `${SRC}/routes`, "./packages/ui"],
              message: STORE,
            },
          ],
        },
      ],
      "no-console": "error",
    },
  },
  {
    // No package either, refused by its name, which the zone above sees only where node_modules sits
    // inside the repository; and no import at run time, which no-restricted-imports does not read.
    files: [`${SRC}/sw/**`],
    ignores: TESTS,
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^[^.]", message: SW }] }],
      "no-restricted-syntax": ["error", ...SWALLOWED, { selector: "ImportExpression", message: SW }],
      // The worker fetches and caches; its page side asks whether the host answers: nothing else.
      ...reaching(REACHES.filter((name) => name !== "fetch" && name !== "caches")),
    },
  },
  {
    files: [`${SRC}/lib/**`],
    ignores: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: REACTS, message: LIB },
            { regex: "^zustand(/|$)", message: LIB },
          ],
        },
      ],
    },
  },
  {
    // zustand's root and its react entry bring hooks: the store takes the vanilla one.
    files: [`${SRC}/store/**`],
    ignores: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: REACTS, message: STORE },
            { regex: "^zustand(/react)?$", message: STORE },
          ],
        },
      ],
    },
  },
  { files: [`${SRC}/**/*.{ts,tsx}`], ignores: [`${SRC}/lib/**`, `${SRC}/sw/**`, ...TESTS], rules: reaching(REACHES) },
);
