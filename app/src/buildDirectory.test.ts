import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDirectoryOf } from "./buildDirectory.ts";

// A build empties its folder before it writes: an empty GNOWORLD_BUILD, which `??` kept, named the app itself, and a build wiped app/.
const APP = "/repo/app";

describe("the build's folder", () => {
  it("is app/build when GNOWORLD_BUILD is not set", () => {
    expect(buildDirectoryOf(undefined, APP)).toBe("build");
  });

  it.each(["/tmp/gnoworld-build", "/repo/app/build-gate/ci"])("is GNOWORLD_BUILD's absolute folder: %s", (asked) => {
    expect(buildDirectoryOf(asked, APP)).toBe(asked);
  });

  it.each(["", "  ", ".", "./", "src"])("stops the build when GNOWORLD_BUILD is not absolute (%j)", (asked) => {
    expect(() => buildDirectoryOf(asked, APP)).toThrow(/GNOWORLD_BUILD must be an absolute folder/);
  });

  it.each(["/repo/app", "/repo/app/", "/repo/app/src/.."])(
    "stops the build when GNOWORLD_BUILD is the app itself (%s)",
    (asked) => {
      expect(() => buildDirectoryOf(asked, APP)).toThrow(/GNOWORLD_BUILD must not be the app's own folder/);
    },
  );
});

// The build's own config reads it through this guard: set but empty, the config stops before any build.
describe("the build's config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stops when GNOWORLD_BUILD is set but empty", async () => {
    vi.stubEnv("GNOWORLD_BUILD", "");
    vi.resetModules();
    await expect(import("../react-router.config.ts")).rejects.toThrow(/GNOWORLD_BUILD must be an absolute folder/);
  });
});
