import { describe, expect, it } from "vitest";
import { realmRoom } from "./realmRoom.ts";

const ROOM = /^#[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/;
const HUBS = [
  { slug: "govdao", realms: ["gno.land/r/gov/dao"] },
  { slug: "bubble" },
  { slug: "zenao", realms: ["gno.land/r/zenao/eventreg"] },
];

describe("realmRoom", () => {
  it("gives a realm alone in its namespace its world's main room", () => {
    expect(realmRoom("gno.land/r/leon", [])).toEqual({ world: "leon", room: "#leon" });
    expect(realmRoom("gno.land/r/leon/v3", [])).toEqual({ world: "leon", room: "#leon" });
  });

  it("gives the realm a world is named for its main room, its slug the id with / as a hyphen and ten hex of the id", () => {
    expect(realmRoom("gno.land/r/gnoland/blog", [])).toEqual({
      world: "gnoland-blog-8730f8e792",
      room: "#gnoland-blog-8730f8e792",
    });
  });

  it("gives any other realm a room of its world, named by its tail and ten hex of its path", () => {
    const { world, room } = realmRoom("gno.land/r/gnogolf/golf_v2/v3", []);
    expect(world).toBe("gnogolf-golf-e00c30567c");
    expect(room).toMatch(/^#gnogolf-golf-e00c30567c\/golf-v2-[0-9a-f]{10}$/);
  });

  it("keeps two versions of a path apart when the tail alone would not", () => {
    const rooms = ["gno.land/r/gnogolf/golf_a/v1", "gno.land/r/gnogolf/golf_a/v2"].map((p) => realmRoom(p, []).room);
    expect(rooms[0]).not.toBe(rooms[1]);
  });

  it("is the same room every time, its suffix the first five bytes of the path's SHA-256", () => {
    // printf %s gno.land/r/gnoland/blog/post | shasum -a 256
    expect(realmRoom("gno.land/r/gnoland/blog/post", []).room).toBe("#gnoland-blog-8730f8e792/post-65e00fb911");
  });

  it("takes the hub's slug as the world when a hub holds the realm's world", () => {
    expect(realmRoom("gno.land/r/gov/dao", HUBS)).toEqual({ world: "govdao", room: "#govdao" });
    expect(realmRoom("gno.land/r/zenao/eventreg", HUBS)).toEqual({ world: "zenao", room: "#zenao" });
    const other = realmRoom("gno.land/r/zenao/eventreg/v2", HUBS);
    expect(other.world).toBe("zenao");
  });

  it("never gives a realm a hub's room by the hub's name when the hub holds no realm of that world", () => {
    const { world, room } = realmRoom("gno.land/r/bubble", HUBS);
    expect(world).toMatch(/^bubble-[0-9a-f]{10}$/);
    expect(room).toBe(`#${world}`);
  });

  it("never puts a realm in the world earth, whose #earth is the general chat, even one deployed under that namespace", () => {
    for (const path of ["gno.land/r/earth", "gno.land/r/earth/v2", "gno.land/r/earth/shop"]) {
      const { world, room } = realmRoom(path, []);
      expect(world, path).toMatch(/^earth-.*[0-9a-f]{10}$/);
      expect(room.startsWith("#earth/"), path).toBe(false);
    }
  });

  it("slugs a namespace with a hyphen or an underscore", () => {
    expect(realmRoom("gno.land/r/nym-alexis_1/app", []).world).toBe("nym-alexis-1-app-6d211d0b19");
  });

  it("never gives two worlds one slug, whatever their separators", () => {
    const pairs = [
      ["gno.land/r/ab-cd", "gno.land/r/ab/cd/y"],
      ["gno.land/r/a_b/c", "gno.land/r/a-b/c"],
      ["gno.land/r/a-b/c", "gno.land/r/a/b/c/d"],
    ] as const;
    for (const [one, other] of pairs) expect(realmRoom(one, []).world).not.toBe(realmRoom(other, []).world);
  });

  it("cuts a long world to a slug of 40 characters with ten hex of its id, and the room still fits 64", () => {
    const path = `gno.land/r/${"w".repeat(30)}/${"x".repeat(60)}/leaf`;
    const { world, room } = realmRoom(path, []);
    expect(world).toMatch(/^w+-[0-9a-f]{10}$/);
    expect(world.length).toBeLessThanOrEqual(40);
    expect(room.length).toBeLessThanOrEqual(64);
    expect(room).toMatch(ROOM);
    expect(realmRoom(`${path}2`, []).world).toBe(realmRoom(`${path}2`, []).world);
  });

  it("keeps two long worlds that share their first 29 characters apart", () => {
    const base = `gno.land/r/${"w".repeat(40)}`;
    expect(realmRoom(`${base}a/one`, []).world).not.toBe(realmRoom(`${base}b/one`, []).world);
  });

  it("fits 64 characters under a hub whose slug is 40 characters", () => {
    const slug = "h".repeat(40);
    const { room } = realmRoom(`gno.land/r/ns/folder/${"t".repeat(80)}`, [
      { slug, realms: ["gno.land/r/ns/folder/leaf"] },
    ]);
    expect(room.length).toBeLessThanOrEqual(64);
    expect(room).toMatch(ROOM);
    expect(room.startsWith(`#${slug}/`)).toBe(true);
  });

  it("names a tail that holds no letter or digit realm", () => {
    expect(realmRoom("gno.land/r/ns/folder/___", []).room).toMatch(/^#ns-folder-[0-9a-f]{10}\/realm-[0-9a-f]{10}$/);
  });
});
