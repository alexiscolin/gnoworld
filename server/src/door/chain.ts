// The chain a room's world lives on, for a function Jarvis explains (D13920): the server serves one universe, its default
// one, and every room it holds belongs to a world of it. A room the server does not hold (a ghost, a private message) has none.
import type { DatabaseSync } from "node:sqlite";

// `chainId` is read at the first ask, not at boot: a universes file that cannot be read stops the server where its own setting is checked.
// `of` is the chain of a room the server holds, none for another; `fallback` is the default universe's, which a room with none is read on.
export function chainsOf(db: DatabaseSync, chainId: () => string | undefined) {
  const known = db.prepare("SELECT 1 AS one FROM rooms WHERE name = ?");
  const chain = { read: false, id: undefined as string | undefined };
  const fallback = (): string | undefined => {
    if (!chain.read) [chain.read, chain.id] = [true, chainId()];
    return chain.id;
  };
  return { fallback, of: (room: string) => (known.get(room) === undefined ? undefined : fallback()) };
}
