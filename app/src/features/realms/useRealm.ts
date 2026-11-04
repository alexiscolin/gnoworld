// What a realm's view reads (5h), once: the realm's page (vm/qrender) and the block height (the page's age), the two
// requests through lib/chain, and the chat's drawing, a lazy chunk. Nothing polls: one request each per view. A read that
// fails is a state with its next step, never a blank; the height failing leaves the page standing, said so.
import { page, type Page } from "@gnoworld/core";
import { useEffect, useState } from "react";
import { readHeight } from "@gnoworld/chain/node";
import { readPage } from "../../lib/chain/rpc.ts";
import type { Failure, ReadOptions } from "@gnoworld/chain/read";
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

const NO_OPTIONS: ReadOptions = {};

/** A realm's page and the height it was read at, read when the view first draws and again only if the realm or the RPC change. */
export function useRealm({ rpc, realm, origin }: RealmSource, options: ReadOptions = NO_OPTIONS): Realm {
  const [read, setRead] = useState<{ key: string; value: Realm }>();
  const key = `${rpc} ${realm} ${origin ?? ""}`;
  useEffect(() => {
    let live = true;
    const done = (value: Realm) => {
      if (live) setRead({ key, value });
    };
    Promise.all([readPage(rpc, { realm }, options), readHeight(rpc, options), drawing()]).then(
      ([body, height, via]) => {
        if (!body.ok) {
          done({ state: "failed", failure: body.failure });
          return;
        }
        const at = height.ok ? height.value : height.failure;
        done({ state: "read", page: page(body.value, origin === undefined ? {} : { origin }), via, height: at });
      },
      () => {
        done({ state: "failed", failure: undefined });
      },
    );
    return () => {
      live = false;
    };
  }, [key, rpc, realm, origin, options]);
  return read?.key === key ? read.value : { state: "loading" };
}
