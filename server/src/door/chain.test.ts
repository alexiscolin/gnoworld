import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../migrations.ts";
import { chainsOf } from "./chain.ts";

// D13920: the chain a room's world lives on, for a function Jarvis explains.
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
const setup = () => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  db.prepare(
    "INSERT INTO rooms (name, world, created_at) VALUES ('#bubble', 'bubble', 0), ('#bubble/crew', 'bubble', 0)",
  ).run();
  return db;
};

describe("the chain of a room", () => {
  it("is the server's universe chain for a room it holds, a world's lobby or its other rooms", () => {
    const chainOf = chainsOf(setup(), () => "gnoland-1").of;
    expect([chainOf("#bubble"), chainOf("#bubble/crew")]).toEqual(["gnoland-1", "gnoland-1"]);
  });

  it("is none for a room the server does not hold: a ghost, a private message, an empty name", () => {
    const chainOf = chainsOf(setup(), () => "gnoland-1").of;
    expect([chainOf("#nowhere"), chainOf("anna"), chainOf("")]).toEqual([undefined, undefined, undefined]);
  });

  it("is none for every room when the server has no universe", () => {
    expect(chainsOf(setup(), () => undefined).of("#bubble")).toBeUndefined();
  });
});

describe("the chain of the universe", () => {
  it("is read once, at the first room the server holds, and not for a room it does not", () => {
    let reads = 0;
    const chainOf = chainsOf(setup(), () => {
      reads += 1;
      return "gnoland-1";
    }).of;
    chainOf("#nowhere");
    expect(reads).toBe(0);
    chainOf("#bubble");
    chainOf("#bubble/crew");
    expect(reads).toBe(1);
  });

  it("is the default universe's for a room the server does not hold, as a fallback and never as the room's own", () => {
    const chains = chainsOf(setup(), () => "gnoland-1");
    expect([chains.of("#nowhere"), chains.fallback()]).toEqual([undefined, "gnoland-1"]);
  });
});
