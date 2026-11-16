// A realm's name and its version family: `connect4`, `connect4_v2` and `connect4_v4` are one game, however many versions the chain holds.

import { REALM_PREFIX } from "../chain/realm.ts";

const VERSION_DIRECTORY = /^v\d+$/;
const VERSION_SUFFIX = /_v\d+$/;

/** The realm's own name, lowercase: its last segment, or the one before a `/v1` directory. */
export function nameOf(path: string): string {
  const bare = path.toLowerCase().replace(/\/v\d+$/, "");
  return bare.slice(bare.lastIndexOf("/") + 1);
}

/** A realm's short name for a title, a crumb and a card, and the namespace it stands under: one name wherever it is shown. */
export function realmName(path: string): { namespace: string; name: string } {
  return { namespace: path.slice(REALM_PREFIX.length).split("/")[0] ?? "", name: nameOf(path) };
}

/** The path without its version: a `/vN` directory or a `_vN` suffix; digits a name ends with (`gov2`, `grc20`) are its own. */
export function familyOf(path: string): string {
  const at = path.lastIndexOf("/");
  const head = path.slice(0, at);
  const name = path.slice(at + 1);
  if (VERSION_DIRECTORY.test(name)) return head;
  const stem = name.replace(VERSION_SUFFIX, "");
  return stem === "" ? path : `${head}/${stem}`;
}
