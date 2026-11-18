import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDirectoryOf } from "./buildDirectory.ts";

// A build empties its folder before it writes: an empty GNOWORLD_BUILD, which `??` kept, named the app itself, and a build wiped app/.
describe("the build's folder", () => {
  it("is app/build when GNOWORLD_BUILD is not set", () => {
    expect(buildDirectoryOf(undefined)).toBe("build");
  });

  it("is GNOWORLD_BUILD's folder when it names one", () => {
    expect(buildDirectoryOf("/tmp/gnoworld-build")).toBe("/tmp/gnoworld-build");
  });

  it.each(["", "  "])("stops the build when GNOWORLD_BUILD is set but empty (%j)", (asked) => {
    expect(() => buildDirectoryOf(asked)).toThrow(/GNOWORLD_BUILD is empty/);
  });
});

// The build's own config reads it through this guard: set but empty, the config stops before any build.
describe("the build's config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stops when GNOWORLD_BUILD is set but empty", async () => {
    vi.stubEnv("GNOWORLD_BUILD", "");
    vi.resetModules();
    await expect(import("../react-router.config.ts")).rejects.toThrow(/GNOWORLD_BUILD is empty/);
  });
});
