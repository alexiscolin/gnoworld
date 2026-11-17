import { expect, test } from "vitest";
import { phoneLanding, remembers } from "./phoneLanding.ts";

const here = {
  earth: { path: "/earth", canonical: "/net/gnoland/earth" },
  worlds: [{ path: "/w/bubble" }, { path: "/w/govdao" }],
};
const onyx = {
  earth: { path: "/net/gnoland/earth", canonical: "/net/gnoland/earth" },
  worlds: [{ path: "/net/gnoland/w/bubble" }],
};

test("nothing recorded lands in the Earth's full chat", () => {
  expect(phoneLanding(here, [])).toBe("/earth?chat=full");
  expect(phoneLanding(onyx, [])).toBe("/net/gnoland/earth?chat=full");
});

test("the last world or the Earth recorded, newest first, a realm passed skipped", () => {
  expect(phoneLanding(here, ["/r/gno.land/r/x", "/w/govdao", "/w/bubble"])).toBe("/w/govdao?chat=full");
  expect(phoneLanding(here, ["/earth", "/w/bubble"])).toBe("/earth?chat=full");
});

test("a stale or unknown place, or another universe's, is skipped", () => {
  expect(phoneLanding(here, ["/w/gone", "/net/gnoland/w/bubble", "/w/bubble"])).toBe("/w/bubble?chat=full");
  expect(phoneLanding(here, ["/w/gone"])).toBe("/earth?chat=full");
  expect(phoneLanding(onyx, ["/w/bubble", "/net/gnoland/w/bubble"])).toBe("/net/gnoland/w/bubble?chat=full");
});

test("only a world's or the Earth's path is worth remembering", () => {
  expect(remembers("/w/bubble")).toBe(true);
  expect(remembers("/earth")).toBe(true);
  expect(remembers("/net/gnoland/w/bubble")).toBe(true);
  expect(remembers("/r/gno.land/r/x")).toBe(false);
  expect(remembers("/")).toBe(false);
});
