import { describe, expect, it } from "vitest";
import { detect, isOlder, MIN_SIGN_IN } from "./detect.ts";

describe("detect", () => {
  it.each([
    ["no extension", undefined],
    ["null", null],
    ["a string", "adena"],
    ["a number", 7],
  ])("says missing for %s", (_, adena) => {
    expect(detect(adena)).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    ["an empty object", {}],
    ["a version and nothing else", { version: "1.23.0" }],
    ["an AddEstablish that is no function", { version: "1.23.0", AddEstablish: 1 }],
    ["a function that is no AddEstablish", { version: "1.23.0", GetAccount: () => 1 }],
  ])("says missing for %s: AddEstablish is the sign of an extension", (_, adena) => {
    expect(detect(adena)).toEqual({ ok: false, reason: "missing" });
  });

  it("cuts a version of a million characters to 32, which is then no version and asks for an update", () => {
    const found = detect({ version: "1.23.0".padEnd(1_000_000, "x"), AddEstablish: () => 1 });
    expect(found).toMatchObject({ ok: true });
    const version = found.ok ? found.version : undefined;
    expect(version).toHaveLength(32);
    expect(isOlder(version, MIN_SIGN_IN)).toBe(true);
  });

  it("reads the extension's version once, as it is", () => {
    expect(detect({ version: "1.23.0", AddEstablish: () => 1 })).toEqual({ ok: true, version: "1.23.0" });
  });

  it("finds an extension whose version is not a string, with no version", () => {
    expect(detect({ version: 7, AddEstablish: () => 1 })).toEqual({ ok: true, version: undefined });
    expect(detect({ AddEstablish: () => 1 })).toEqual({ ok: true, version: undefined });
  });

  it("is not thrown by a getter that throws: a result, not an exception", () => {
    const adena = {
      get version(): string {
        throw new Error("extension gone");
      },
      AddEstablish: () => 1,
    };
    expect(detect(adena)).toEqual({ ok: false, reason: "failed" });
  });

  it("is not thrown by a proxy whose every trap throws", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("get");
        },
        has() {
          throw new Error("has");
        },
        getPrototypeOf() {
          throw new Error("proto");
        },
      },
    );
    expect(detect(hostile)).toEqual({ ok: false, reason: "failed" });
  });

  it("reads the version once: a getter that answers twice differently is read one time", () => {
    let reads = 0;
    const adena = {
      get version() {
        reads += 1;
        return reads === 1 ? "1.23.0" : "0.0.1";
      },
      AddEstablish: () => 1,
    };
    expect(detect(adena)).toEqual({ ok: true, version: "1.23.0" });
    expect(reads).toBe(1);
  });
});

describe("isOlder", () => {
  it("pins sign-in's minimum to the 1.22.2 the plan names", () => {
    expect(MIN_SIGN_IN).toBe("1.22.2");
  });

  it.each([
    ["1.22.1", "1.22.2", true],
    ["1.22.2", "1.22.2", false],
    ["1.22.10", "1.22.2", false],
    ["1.9.0", "1.22.2", true],
    ["2.0.0", "1.22.2", false],
    ["10.0.0", "1.22.2", false],
    ["1.22.2", "10.0.0", true],
    ["0.99.99", "1.0.0", true],
  ])("%s against %s: %s", (version, minimum, older) => {
    expect(isOlder(version, minimum)).toBe(older);
  });

  it.each(["", "abc", "1.22", "1.22.x", "1.22.2.1", "-1.0.0"])(
    "takes the version %j for unreadable, so for older: an update is asked, nothing is guessed",
    (version) => {
      expect(isOlder(version, "1.22.2")).toBe(true);
    },
  );

  it("takes no version for unknown, not for older", () => {
    expect(isOlder(undefined, "1.22.2")).toBe(false);
  });
});
