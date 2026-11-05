import { describe, expect, it } from "vitest";
import { z } from "./jitless.ts";

// A module runs after those it imports, whatever chunk the bundler gives it (lib/jitless.ts says why that counts):
// every source the page bundles takes z from lib/jitless.ts or the schemas' zod.ts, read here as text by Vite.
const SOURCES = import.meta.glob<string>(
  [
    "../**/*.{ts,tsx,mts,cts,js,jsx}",
    "../../../packages/{core,ui,schemas,chain}/src/**/*.{ts,tsx,mts,cts,js,jsx}",
    "!../**/*.{test,stories}.*",
    "!../../../packages/*/src/**/*.{test,stories}.*",
    "!./jitless.ts",
    "!../../../packages/schemas/src/zod.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
// Any module name of Zod's, once the type-only imports, which build nothing, are taken out.
const REACHES_ZOD = /["'`]zod(?:\/[^"'`]*)?["'`]/;
const values = (text: string): string => text.replace(/^import\s+type\b[^;]*;/gm, "");

describe("the page's Zod", () => {
  it("has its compiler off once imported", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("reads every source the page bundles, the schemas' among them", () => {
    const names = Object.keys(SOURCES);
    expect(names).toContain("./adena/adena.ts");
    expect(names).toContain("../../../packages/schemas/src/rooms.ts");
    expect(names).toContain("../../../packages/core/src/irc/irc.ts");
    expect(names).not.toContain("./jitless.test.ts");
  });

  it.each(Object.entries(SOURCES))("%s reaches Zod through a module that turns its compiler off", (_, text) => {
    expect(values(text)).not.toMatch(REACHES_ZOD);
  });
});
