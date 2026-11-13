import type { DatabaseSync } from "node:sqlite";
import { realmRoom } from "@gnoworld/core";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../migrations.ts";
import { namespaceFinder } from "./namespaceOf.ts";

// Part 4's red pass, H2: the namespace a room is judged by comes from the server's own tables (realm_rooms.path, a hub's first realm), on a
// real database; a room's name, whatever it looks like, grants nothing.
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const HUBS = new Map([["hubby", "acme/feed"]]);
const setup = (rows: [string, string | null][] = []) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  for (const [name, path] of rows) {
    db.prepare("INSERT INTO rooms (name, world, created_at) VALUES (?, ?, 0)").run(
      name,
      name.slice(1).split("/")[0] ?? "",
    );
    db.prepare("INSERT INTO realm_rooms (name, path) VALUES (?, ?)").run(name, path);
  }
  return namespaceFinder(db, HUBS);
};

describe("a room's namespace", () => {
  it("is the second segment of the path its realm room was made for", () => {
    const of = setup([
      ["#acme-feed", "gno.land/r/acme/feed"],
      ["#nym", "gno.land/r/nym"],
    ]);
    expect(of("#acme-feed")).toBe("acme");
    expect(of("#nym")).toBe("nym");
  });

  it("is the first realm's namespace for a hub's main room, with no path or a tagged one", () => {
    expect(setup()("#hubby")).toBe("acme");
    expect(setup([["#hubby", null]])("#hubby")).toBe("acme");
    expect(setup([["#hubby", "gno.land/r/acme/feed"]])("#hubby")).toBe("acme");
  });

  it("gives the owner of one realm of a hub of two namespaces nothing in the other realm's rooms", () => {
    const of = setup([
      ["#other-x-0123456789", "gno.land/r/other/x"],
      ["#hubby/feed-0123456789", "gno.land/r/acme/feed"],
    ]);
    expect(of("#other-x-0123456789")).toBe("other");
    expect(of("#hubby/feed-0123456789")).toBe("acme");
    expect(of("#hubby")).toBe("acme");
  });

  it("is none for the Earth, a realm room with no path outside a hub, a room with no row and a path that is no realm's", () => {
    const of = setup([
      ["#orphan", null],
      ["#odd", "gno.land/p/acme/lib"],
    ]);
    for (const room of ["#earth", "#earth/club", "#orphan", "#unknown", "#odd"]) expect(of(room)).toBeUndefined();
  });

  it("trusts a hub's main room's row over the hub's name: a path that is no realm's gives none", () => {
    expect(setup([["#hubby", "gno.land/p/acme/lib"]])("#hubby")).toBeUndefined();
  });

  it("is not made by a room named like an address: only the row's path counts", () => {
    const name = "#g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    expect(setup()(name)).toBeUndefined();
    expect(setup([[name, null]])(name)).toBeUndefined();
    expect(setup([[name, "gno.land/r/acme/x"]])(name)).toBe("acme");
  });

  it("cannot be taken by a visitor's path: a path of another namespace never maps to a listed realm's room, a hub's included", () => {
    const hubs = [{ slug: "hubby", realms: ["gno.land/r/acme/feed"] }];
    const listed = realmRoom("gno.land/r/acme/feed", hubs).room;
    const paths = [
      "gno.land/r/hubby",
      "gno.land/r/acme-feed",
      "gno.land/r/acmefeed",
      "gno.land/r/other/feed",
      "gno.land/r/other/hubby",
      "gno.land/r/earth",
      "gno.land/r/x/hubby",
      "gno.land/r/acme_feed/feed",
    ];
    expect(listed).toBe("#hubby");
    for (const path of paths) expect(realmRoom(path, hubs).room).not.toBe(listed);
    // The same namespace may share the room (versions, siblings of one world), which changes no namespace.
    expect(realmRoom("gno.land/r/acme/feed_v2", hubs).room.startsWith("#hubby")).toBe(true);
  });
});

describe("a room's namespace (the mutants of slice 13)", () => {
  it("is none for a path whose namespace is empty, never an empty name to read", () => {
    expect(setup([["#nameless", "gno.land/r//feed"]])("#nameless")).toBeUndefined();
  });
});
