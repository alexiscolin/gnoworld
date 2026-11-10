// Every query's key, in one place; a chain's read names its chain (its RPC or its indexer's address), so a universe switch reads its own.
import type { QueryClient } from "@tanstack/react-query";

export const keys = {
  page: (rpc: string, realm: string, origin: string | undefined) =>
    ["realm", rpc, realm, "page", origin ?? ""] as const,
  functions: (rpc: string, realm: string) => ["realm", rpc, realm, "functions"] as const,
  facts: (indexer: string, realm: string) => ["realm", indexer, realm, "facts"] as const,
  rollup: (base: string, realm: string) => ["rollup", base, realm] as const,
  worlds: (base: string) => ["worlds", base] as const,
  worldsCount: (base: string) => ["worlds", base, "count"] as const,
  proposals: (rpc: string, realm: string) => ["realm", rpc, realm, "proposals"] as const,
  name: (chainId: string, account: string, again: number) => ["name", chainId, account, again] as const,
  previews: (base: string) => ["previews", base] as const,
  rooms: (query: string) => ["rooms", query] as const,
  activity: (slug: string) => ["activity", slug] as const,
  presence: () => ["presence"] as const,
  people: () => ["people"] as const,
  hours: (world: string) => ["hours", world] as const,
};

/** A call of `realm` was accepted: its page, its facts and its proposals are read again at the next look (a mounted view reads them at once). */
export const invalidateRealm = (client: QueryClient, realm: string): Promise<void> =>
  client.invalidateQueries({
    predicate: ({ queryKey: [root, , path, kind] }) =>
      root === "realm" && path === realm && (kind === "page" || kind === "facts" || kind === "proposals"),
  });
