// A realm's chat room (D389), from its path alone, so the server that makes it and the page that asks for it never differ. A realm that
// is its world's root (alone in its namespace, or the one the world is named for) takes the world's main room, #<world>; any other is
// #<world>/<tail>-<10 hex of its path's SHA-256>, which fits the 64 characters of a room however long the path. A world that is a hub's is
// the hub's slug; any other is its id as a slug, with ten hex of the id unless the id is a plain word no hub is named and not the Earth's, so no realm
// takes a hub's room by its name and two ids never meet.
import { REALM_PREFIX } from "../chain/realm.ts";
import { sha256 } from "../planet/sha256.ts";
import { asciiBytes, hexOf } from "../text/bytes.ts";
import { EARTH, hubWorldOf, worldIdOf } from "./worldId.ts";

const ROOM_MAX = 64;
const WORLD_MAX = 40;
const HEX = 10;
const TAIL_MAX = 21;
const VERSION = /^\/v[0-9]+$/;

interface Hub {
  readonly slug: string;
  readonly realms?: readonly string[] | undefined;
}

// Ten hex of the text's SHA-256; an ASCII text, as every realm path and world id is.
const hashOf = (text: string): string => hexOf(sha256(asciiBytes(text)).subarray(0, HEX / 2));

const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// The world's slug: the id as it stands when it is one plain word no hub is named, else its slug cut to leave room for ten hex of the id.
function worldSlug(id: string, hubs: readonly Hub[]): string {
  if (/^[a-z0-9]+$/.test(id) && id.length <= WORLD_MAX && id !== EARTH && !hubs.some(({ slug }) => slug === id))
    return id;
  return `${slugOf(id)
    .slice(0, WORLD_MAX - HEX - 1)
    .replace(/-+$/, "")}-${hashOf(id)}`;
}

/** The world and the room of a realm's chat: `hubs` are the universe's, for the hub that holds the realm's world. */
export function realmRoom(path: string, hubs: readonly Hub[]): { world: string; room: string } {
  const id = worldIdOf(path);
  const held = hubs.find((hub) => hub.realms !== undefined && hubWorldOf(hub) === id);
  const world = held?.slug ?? worldSlug(id, hubs);
  const root = `${REALM_PREFIX}${id}`;
  const rest = path.slice(root.length);
  if (path.startsWith(root) && (rest === "" || VERSION.test(rest))) return { world, room: `#${world}` };
  const unversioned = path.replace(/(?<=.)\/v[0-9]+$/, "");
  const tail = slugOf(unversioned.slice(unversioned.lastIndexOf("/") + 1)) || "realm";
  const fits = Math.min(TAIL_MAX, ROOM_MAX - 3 - HEX - world.length);
  const cut = tail.slice(0, fits).replace(/-+$/, "") || "realm";
  return { world, room: `#${world}/${cut}-${hashOf(path)}` };
}
