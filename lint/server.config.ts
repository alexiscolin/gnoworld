// The services' folders (docs/ARCHITECTURE.md, "Which way dependencies point"): the server, Jarvis and what they share
// (packages/service) import core, schemas, Node and their own dependencies, never the browser's code nor each other
// (decision-isolation.md, D110): a wall holds tests too. fetch only in packages/service's net.ts, whose helper sets the
// timeout; console nowhere, the logger writes. The network's real boundary is the egress proxy (slice 3e), not this list.
// A part of the lint config, which eslint.config.ts composes.
import type { Linter } from "eslint";
import { defineConfig } from "eslint/config";
import { TESTS } from "./shared.config.ts";

const SERVER =
  "The server imports core, schemas, the service and chain packages, Node and its framework, never Jarvis (docs/ARCHITECTURE.md).";
const JARVIS =
  "Jarvis imports core, schemas, the service and chain packages, Node and its dependencies, never the server (docs/ARCHITECTURE.md).";
const LINK_READER =
  "The link reader imports core, schemas, Node and its dependencies, never the server, Jarvis, the service or chain packages (slice 13).";
const SERVICE =
  "The service package imports core, schemas, Node and its dependencies, never the server, Jarvis, the app or the chain package (D111).";
const SERVICES = ["server/**/*.ts", "jarvis/**/*.ts", "link-reader/**/*.ts", "packages/service/**/*.ts"];
// By name, so the ban holds wherever node_modules sits (F385): the browser's code, the workspaces a folder never imports, and
// a require made by hand, which crosses the zones unread (D123, F5278).
const banned = (workspaces: string, message: string): Linter.RuleEntry => [
  "error",
  {
    paths: ["node:module", "module"].map((name) => ({ name, importNames: ["createRequire"], message })),
    patterns: [
      { regex: "^(react|react-dom|three|@gnoworld/ui)(/|$)", message },
      { regex: `^@gnoworld/(${workspaces})(/|$)`, message },
    ],
  },
];

export default defineConfig(
  {
    files: SERVICES,
    rules: {
      // A path out of the folder by the zone; a name by each folder's own list, below.
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./server",
              from: "./",
              except: [
                "./server",
                "./packages/core",
                "./packages/schemas",
                "./packages/service",
                "./packages/chain",
                "./node_modules",
              ],
              message: SERVER,
            },
            {
              target: "./jarvis",
              from: "./",
              except: [
                "./jarvis",
                "./packages/core",
                "./packages/schemas",
                "./packages/service",
                "./packages/chain",
                "./node_modules",
              ],
              message: JARVIS,
            },
            {
              target: "./link-reader",
              from: "./",
              except: ["./link-reader", "./packages/core", "./packages/schemas", "./node_modules"],
              message: LINK_READER,
            },
            {
              target: "./packages/service",
              from: "./",
              except: ["./packages/service", "./packages/core", "./packages/schemas", "./node_modules"],
              message: SERVICE,
            },
          ],
        },
      ],
      "no-console": "error",
    },
  },
  { files: ["server/**/*.ts"], rules: { "no-restricted-imports": banned("jarvis|link-reader", SERVER) } },
  { files: ["jarvis/**/*.ts"], rules: { "no-restricted-imports": banned("server|link-reader", JARVIS) } },
  {
    files: ["link-reader/**/*.ts"],
    rules: { "no-restricted-imports": banned("server|jarvis|app|chain|service", LINK_READER) },
  },
  {
    files: ["packages/service/**/*.ts"],
    rules: { "no-restricted-imports": banned("server|jarvis|link-reader|app|chain", SERVICE) },
  },
  {
    // A test calls the server it started.
    files: SERVICES,
    ignores: ["packages/service/src/net.ts", ...TESTS],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "The server reaches out through net.ts, which sets the timeout." },
      ],
    },
  },
);
