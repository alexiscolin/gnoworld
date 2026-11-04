// The services' folders (docs/ARCHITECTURE.md, "Which way dependencies point"): the server, Jarvis and what they share
// (packages/service) import core, schemas, Node and their own dependencies, never the browser's code; fetch only in
// packages/service's net.ts, whose helper sets the timeout; console nowhere, the logger writes. The network's real
// boundary is the egress proxy (slice 3e), not this list. A part of the lint config, which eslint.config.ts composes.
import { defineConfig } from "eslint/config";
import { TESTS } from "./shared.config.ts";

const SERVER = "The server imports core, schemas, Node and its framework (docs/ARCHITECTURE.md).";
const JARVIS = "Jarvis imports core, schemas, Node and its dependencies (docs/ARCHITECTURE.md).";
const SERVICES = ["server/**/*.ts", "jarvis/**/*.ts", "packages/service/**/*.ts"];

export default defineConfig(
  {
    files: SERVICES,
    rules: {
      // By name, so the ban holds wherever node_modules sits (F385); a path out of the folder by the zone.
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^(react|react-dom|three|@gnoworld/ui)(/|$)", message: SERVER }] },
      ],
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./server",
              from: "./",
              except: ["./server", "./packages/core", "./packages/schemas", "./packages/service", "./node_modules"],
              message: SERVER,
            },
            {
              target: "./jarvis",
              from: "./",
              except: ["./jarvis", "./packages/core", "./packages/schemas", "./packages/service", "./node_modules"],
              message: JARVIS,
            },
          ],
        },
      ],
      "no-console": "error",
    },
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
