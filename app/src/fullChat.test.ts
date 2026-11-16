import { describe, expect, it } from "vitest";
import { phoneGoes } from "./fullChat.ts";

const at = (path: string) => {
  const [rest = "", hash] = path.split("#", 2);
  const [pathname = "", search = ""] = rest.split("?", 2);
  return { pathname, search: search === "" ? "" : `?${search}`, hash: hash === undefined ? "" : `#${hash}` };
};
const go = (path: string, phone = true, home = "/") => phoneGoes(phone, at(path), home);

describe("where a phone goes from an address", () => {
  it("opens a place in its full chat, in any universe", () => {
    expect(go("/w/govdao")).toBe("/w/govdao?chat=full");
    expect(go("/r/gno.land/r/demo/boards")).toBe("/r/gno.land/r/demo/boards?chat=full");
    expect(go("/earth")).toBe("/earth?chat=full");
    expect(go("/earth/")).toBe("/earth/?chat=full");
    expect(go("/net/onyx/w/memba")).toBe("/net/onyx/w/memba?chat=full");
    expect(go("/net/onyx/earth")).toBe("/net/onyx/earth?chat=full");
  });

  it("keeps the room, the person and the hash the address asked for", () => {
    expect(go("/w/govdao?room=dev")).toBe("/w/govdao?room=dev&chat=full");
    expect(go("/w/govdao?dm=g1abc#top")).toBe("/w/govdao?dm=g1abc&chat=full#top");
    expect(go("/earth#x")).toBe("/earth?chat=full#x");
  });

  it("does nothing on a computer, or in the full chat already", () => {
    expect(go("/w/govdao", false)).toBeUndefined();
    expect(go("/universe", false)).toBeUndefined();
    expect(go("/w/govdao?chat=full")).toBeUndefined();
    expect(go("/w/govdao?room=dev&chat=full")).toBeUndefined();
  });

  it("sends the cosmos's addresses and an ecosystem's to the universe's home", () => {
    expect(go("/universe")).toBe("/");
    expect(go("/s/gnoland")).toBe("/");
    expect(go("/s/gnoland/")).toBe("/");
    expect(go("/e/gnoswap")).toBe("/");
    expect(go("/net/onyx/e/gnoswap", true, "/net/onyx")).toBe("/net/onyx");
  });

  it("leaves the home, the list and any other address where they are", () => {
    expect(go("/")).toBeUndefined();
    expect(go("/net/onyx", true, "/net/onyx")).toBeUndefined();
    expect(go("/list")).toBeUndefined();
    expect(go("/nowhere")).toBeUndefined();
    expect(go("/worlds/x")).toBeUndefined();
  });
});
