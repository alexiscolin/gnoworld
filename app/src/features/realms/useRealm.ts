// What a realm's view reads (5h), once: the realm's page (vm/qrender) and the block height (the page's age), the two
// requests through lib/chain, and the chat's drawing, a lazy chunk. Nothing polls: one request each per view. A read that
// fails is a state with its next step, never a blank; the height failing leaves the page standing, said so.
import { page, type Page } from "@gnoworld/core";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { readHeight } from "@gnoworld/chain/node";
import { readPage } from "../../lib/chain/rpc.ts";
import type { Failure, ReadOptions } from "@gnoworld/chain/read";
import { isUnread, queryClient, Unread } from "../../lib/query/client.ts";
import { pageFetch } from "../../lib/query/policy.ts";
import { keys } from "../../lib/query/keys.ts";
import { drawing, type Drawing } from "../chat/index.ts";

export interface Height {
  height: number;
  time: string;
}

/** Whether a height was read, or `at` says why it could not be. */
export const isHeight = (at: Height | Failure): at is Height => "height" in at;

export type Realm =
  | { state: "loading" }
  /** The page was read; `height` is when, or why it could not be known. */
  | { state: "read"; page: Page; via: Drawing; height: Height | Failure }
  /** The page could not be read, or could not be drawn (`failure` none). */
  | { state: "failed"; failure: Failure | undefined };

export interface RealmSource {
  rpc: string;
  /** The realm's path, `gno.land/r/demo/dao`. */
  realm: string;
  /** gnoweb's origin, which the page's links to a path resolve against. */
  origin: string | undefined;
}

// The page, the height and the chat's drawing, as one state.
async function load({ rpc, realm, origin }: RealmSource, options: ReadOptions): Promise<Realm> {
  try {
    const [body, height, via] = await Promise.all([
      readPage(rpc, { realm }, options),
      readHeight(rpc, { ...options, chainId: null }),
      drawing(),
    ]);
    if (!body.ok) return { state: "failed", failure: body.failure };
    const at = height.ok ? height.value : height.failure;
    return { state: "read", page: page(body.value, origin === undefined ? {} : { origin }), via, height: at };
  } catch {
    return { state: "failed", failure: undefined };
  }
}

/** A realm's page and height as a query: kept by its chain, realm and origin, so a view seen again draws it at once and reads it again quietly,
 * and a link's hover or the flight asks it ahead (warm.ts). A page that failed is no answer: it throws, and the last good one stays. */
export const realmPageQuery = ({ rpc, realm, origin }: RealmSource, options?: ReadOptions) =>
  queryOptions({
    queryKey: keys.page(rpc, realm, origin),
    queryFn: async ({ signal }) => {
      const read = await load({ rpc, realm, origin }, { fetch: pageFetch, ...options, signal });
      if (read.state === "failed") throw new Unread(read, read.failure);
      return read;
    },
  });

/** A realm's page and the height it was read at: what is kept at once, then the fresh read (a failed one leaves what is shown), read again
 * only if the realm or the RPC change. */
export function useRealm(source: RealmSource, options?: ReadOptions): Realm {
  const { data, error } = useQuery(realmPageQuery(source, options), queryClient);
  if (data !== undefined) return data;
  return isUnread<Realm>(error) ? error.read : { state: "loading" };
}
