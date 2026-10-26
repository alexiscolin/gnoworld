// The toolchain every test runs on: the Node .node-version pins (toolchain.test.ts holds every run to it).
import { readFileSync } from "node:fs";

/** The Node version .node-version pins, as process.version writes one: v24.22.0. */
export const pinnedNode = (): string =>
  `v${readFileSync(new URL("../../../.node-version", import.meta.url), "utf8").trim()}`;
