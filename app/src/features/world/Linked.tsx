// A world's connected worlds (8g, frames 26, 93, 104), from the worlds' file: the worlds whose realms import this world's ("Memba DAO calls
// this realm"), then those its realms import ("Calls Adena"), "on chain" as the frames say, four at most. A hub is named and linked as its
// page; any other world by its id's last segment and its first realm's view. The rooms shared and the people from elsewhere wait on a source.
import { hubWorldOf, labelName, neighboursOf, REALM_PREFIX, type Neighbour } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import type { Listed } from "../../places.ts";
import { Connected } from "./Connected.tsx";

const SHOWN = 4;

export interface LinkedProps {
  /** This world, as the file holds it. */
  id: string;
  worlds: Worlds["worlds"];
  /** The universe's hubs, which name and link a world they hold. */
  hubs: readonly Listed[];
  /** The universe's own prefix, "" for the default one ("/net/<id>" otherwise). */
  prefix: string;
}

// What a page view asks of the file, kept with it: each world's first realm, indexed once, and the neighbours of a world, worked out the first
// time it is asked (one pass over the file's imports) and a lookup after.
const kept = new WeakMap<
  Worlds["worlds"],
  { realmOf: Map<string, string | undefined>; near: Map<string, Neighbour[]> }
>();

function indexOf(worlds: Worlds["worlds"]) {
  const held = kept.get(worlds) ?? {
    realmOf: new Map(worlds.map((world) => [world.id, world.realms[0]?.path])),
    near: new Map<string, Neighbour[]>(),
  };
  kept.set(worlds, held);
  return held;
}

function nearOf(worlds: Worlds["worlds"], id: string): Neighbour[] {
  const { near } = indexOf(worlds);
  const held = near.get(id) ?? neighboursOf(worlds, id);
  near.set(id, held);
  return held;
}

export default function Linked({ id, worlds, hubs, prefix }: LinkedProps) {
  const byWorld = new Map(hubs.map((hub) => [hubWorldOf(hub), hub]));
  const { realmOf } = indexOf(worlds);
  const rows = nearOf(worlds, id)
    .slice(0, SHOWN)
    .flatMap(({ id: other, calls }) => {
      const hub = byWorld.get(other);
      const realm = realmOf.get(other);
      const path = hub?.path ?? (realm === undefined ? undefined : `${prefix}/r/${realm.slice(REALM_PREFIX.length)}`);
      if (path === undefined) return [];
      const name = hub?.name ?? labelName(other) ?? other;
      return [
        calls
          ? { name: `${name} calls this realm`, path, line: "On chain · imports its realm" }
          : { name: `Calls ${name}`, path, line: "On chain · its realm imports theirs" },
      ];
    });
  return <Connected worlds={rows} />;
}
