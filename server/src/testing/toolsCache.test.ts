import { homedir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { toolsCache } from "./toolsCache.ts";

// An empty GNOWORLD_TOOLS is unset, as ergo.sh, check_nginx.py and workshop.sh read it: workshop.sh passes "${GNOWORLD_TOOLS-}" on (F13755).
it("is the folder GNOWORLD_TOOLS names, else the default one, an empty value included", () => {
  const fallback = join(homedir(), ".cache/gnoworld-tools");
  expect(toolsCache({ GNOWORLD_TOOLS: "/tools" })).toBe("/tools");
  expect(toolsCache({})).toBe(fallback);
  expect(toolsCache({ GNOWORLD_TOOLS: "" })).toBe(fallback);
});
