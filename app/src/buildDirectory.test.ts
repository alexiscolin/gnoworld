import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDirectoryOf } from "./buildDirectory.ts";

// A build empties its folder before it writes: an empty GNOWORLD_BUILD, which `??` kept, named the app itself, and a build wiped app/.
const APP = "/repo/app";

describe("the build's folder", () => {
  it("is app/build when GNOWORLD_BUILD is not set", () => {
    expect(buildDirectoryOf(undefined, APP)).toBe("build");
  });

  it.each(["/tmp/gnoworld-build", "/repo/app/build-gate/ci", "/repo/app/build", "/repo/app/build/x", "/repo/other"])(
    "is GNOWORLD_BUILD's absolute folder: %s",
    (asked) => {
      expect(buildDirectoryOf(asked, APP)).toBe(asked);
    },
  );

  it.each(["", "  ", ".", "./", "src"])("stops the build when GNOWORLD_BUILD is not absolute (%j)", (asked) => {
    expect(() => buildDirectoryOf(asked, APP)).toThrow(/GNOWORLD_BUILD must be an absolute folder/);
  });

  // A folder holding the app: the build would write its client and server there, among the repository's own folders.
  it.each(["/repo/app", "/repo/app/", "/repo/app/src/..", "/repo", "/repo/", "/"])(
    "stops the build when GNOWORLD_BUILD is the app or a folder holding it (%s)",
    (asked) => {
      expect(() => buildDirectoryOf(asked, APP)).toThrow(/GNOWORLD_BUILD must not be the app or a folder holding it/);
    },
  );

  it.each(["/repo/app/src", "/repo/app/public", "/repo/app/builder", "/repo/app/data/build"])(
    "stops the build when GNOWORLD_BUILD is in the app but under no build or build-* folder (%s)",
    (asked) => {
      expect(() => buildDirectoryOf(asked, APP)).toThrow(/in the app, only under build or build-\*/);
    },
  );
});

// The build's own config reads it through this guard: set but empty, the config stops before any build.
describe("the build's config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Up to 20 s: the import compiles the config's modules (1.3 s alone, 5 s seen on a loaded machine).
  it("stops when GNOWORLD_BUILD is set but empty", { timeout: 20_000 }, async () => {
    vi.stubEnv("GNOWORLD_BUILD", "");
    vi.resetModules();
    await expect(import("../react-router.config.ts")).rejects.toThrow(/GNOWORLD_BUILD must be an absolute folder/);
  });
});
