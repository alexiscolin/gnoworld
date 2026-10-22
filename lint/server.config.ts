// The server's folder (docs/ARCHITECTURE.md, "Which way dependencies point"): core, schemas, Node and
// its framework, never the browser's code; fetch only in net.ts, whose helper sets the timeout; console
// nowhere, the logger writes. The network's real boundary is the egress proxy (slice 3e), not this list.
// A part of the lint config, which eslint.config.ts composes.
import { defineConfig } from "eslint/config";
import { TESTS } from "./shared.config.ts";

const SERVER = "The server imports core, schemas, Node and its framework (docs/ARCHITECTURE.md).";

export default defineConfig(
  {
    files: ["server/**/*.ts"],
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
              except: ["./server", "./packages/core", "./packages/schemas", "./node_modules"],
              message: SERVER,
            },
          ],
        },
      ],
      "no-console": "error",
    },
  },
  {
    // A test calls the server it started.
    files: ["server/**/*.ts"],
    ignores: ["server/src/net.ts", ...TESTS],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "The server reaches out through net.ts, which sets the timeout." },
      ],
    },
  },
);
