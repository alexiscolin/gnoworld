import { describe, expect, it } from "vitest";
import { readSettings } from "./config.ts";

const ENV = { LINKS_LISTEN: "172.30.101.10:8084", LINKS_PROXY: "guard:4754", LINKS_MAX: "2" };

describe("the reader's settings", () => {
  it("are read from the environment: the address, the way out and the number of reads at once", () => {
    expect(readSettings(ENV)).toEqual({ host: "172.30.101.10", port: 8084, proxy: "guard:4754", max: 2 });
  });

  it("take 2 reads at once when LINKS_MAX is not set", () => {
    expect(readSettings({ ...ENV, LINKS_MAX: undefined }).max).toBe(2);
  });

  it.each([
    [undefined],
    [""],
    ["8084"],
    ["host:"],
    [":8084"],
    ["host:0"],
    ["host:70000"],
    ["host:80:80"],
    ["host:abc"],
  ])("refuse LINKS_LISTEN %j", (listen) => {
    expect(() => readSettings({ ...ENV, LINKS_LISTEN: listen })).toThrow(/LINKS_LISTEN/);
  });

  it.each([["0"], ["-1"], ["abc"], ["2.5"], ["17"], ["1e3"], ["99999999999"], [" "], ["NaN"], ["Infinity"]])(
    "refuse LINKS_MAX %j: past 1 to 16, or not a whole number",
    (max) => {
      expect(() => readSettings({ ...ENV, LINKS_MAX: max })).toThrow(/LINKS_MAX/);
    },
  );

  it.each([["1"], ["16"]])("take LINKS_MAX %s", (max) => {
    expect(readSettings({ ...ENV, LINKS_MAX: max }).max).toBe(Number(max));
  });

  it("refuse no way out: an unset or empty LINKS_PROXY is an error, never a reader that goes out by itself", () => {
    expect(() => readSettings({ ...ENV, LINKS_PROXY: undefined })).toThrow(/LINKS_PROXY/);
    expect(() => readSettings({ ...ENV, LINKS_PROXY: "" })).toThrow(/LINKS_PROXY/);
  });

  it("allow no way out only with LINKS_DIRECT=1, which is development's (the address checks then pin the connection)", () => {
    expect(readSettings({ ...ENV, LINKS_PROXY: undefined, LINKS_DIRECT: "1" }).proxy).toBeUndefined();
    expect(() => readSettings({ ...ENV, LINKS_PROXY: undefined, LINKS_DIRECT: "true" })).toThrow(/LINKS_PROXY/);
  });

  it("refuse a proxy that is not host:port, and one together with LINKS_DIRECT", () => {
    expect(() => readSettings({ ...ENV, LINKS_PROXY: "http://guard:4754" })).toThrow(/LINKS_PROXY/);
    expect(() => readSettings({ ...ENV, LINKS_PROXY: "guard" })).toThrow(/LINKS_PROXY/);
    expect(() => readSettings({ ...ENV, LINKS_DIRECT: "1" })).toThrow(/LINKS_DIRECT/);
  });

  it("never put a value in the error: a wrong address's text stays out of what is thrown", () => {
    const caught: unknown = (() => {
      try {
        return readSettings({ ...ENV, LINKS_LISTEN: "secret-value" });
      } catch (error) {
        return error;
      }
    })();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("LINKS_LISTEN");
    expect((caught as Error).message).not.toContain("secret-value");
  });
});
