// @vitest-environment jsdom
import { createElement } from "react";
import { expect, test, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { knownOf, useKnown } from "./known.ts";

const failed = (kind: string) => ({ state: "failed", failure: { kind, next: "" } }) as never;

test("a realm the chain says is no realm is known not to exist, even when a file listed it", () => {
  expect(knownOf(true, failed("no-realm"))).toBe("no");
});

test("a down or slow chain proves nothing: the page stays as it is", () => {
  expect(knownOf(false, failed("timeout"))).toBe("unknown");
  expect(knownOf(false, failed("down"))).toBe("unknown");
  expect(knownOf(false, undefined)).toBe("unknown");
  expect(knownOf(false, { state: "loading" })).toBe("unknown");
});

test("a realm listed, read, or with no page exists", () => {
  expect(knownOf(true, undefined)).toBe("yes");
  expect(knownOf(false, { state: "read" } as never)).toBe("yes");
  expect(knownOf(false, failed("no-page"))).toBe("yes");
});

test("reads the realm's page from the cache without a fetch of its own: no missing query function is ever logged", () => {
  const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const Known = () => useKnown({ rpc: "https://rpc.example", realm: "gno.land/r/x/y", origin: undefined }, false);
  mount(createElement(Known));
  expect(said.mock.calls.flat().join(" ")).not.toMatch(/No queryFn/);
  said.mockRestore();
});
