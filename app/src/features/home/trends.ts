// The chain's trends in the home's ticker (7t): a few items the server computes from the worlds job's passes and who is here, read once the
// page runs, never the worlds' file. Each is placed as the page places its worlds: a hub by its name and page, another world by the chain's
// title and its first realm's view, the Earth by its own; one the page cannot place is left out. Each says when its data was read.
import { Trends, TRENDS_MAX_BYTES, type Trend } from "@gnoworld/schemas/indexer";
import { useEffect, useState } from "react";
import { readSiteFile, type SiteFileRead } from "../../lib/chain/transport.ts";
import { EARTH, hubWorldOf, pagesOf, type WorldPlaces } from "../../lib/hubWorld.ts";
import { stampOf } from "./stamp.ts";
import type { TickerItem } from "./ticker.ts";

/** The server's trends, at this site's root. */
export const TRENDS_URL = "/api/trends";

/** The server's trends, or nothing if they did not come whole. */
export function readTrends(options: SiteFileRead = {}): Promise<Trends | undefined> {
  return readSiteFile(TRENDS_URL, Trends, { ...options, maxBytes: TRENDS_MAX_BYTES });
}

const NONE: readonly Trend[] = [];

/** The server's trends once the page runs, while `wanted`: none in the page the build writes, the read let go when the page leaves. */
export function useTrends(wanted: boolean): readonly Trend[] {
  const [items, setItems] = useState(NONE);
  useEffect(() => {
    if (!wanted) return undefined;
    const leaving = new AbortController();
    readTrends({ signal: leaving.signal })
      .then((read) => {
        if (read !== undefined && !leaving.signal.aborted) setItems(read.items);
      })
      .catch(reportError);
    return () => {
      leaving.abort();
    };
  }, [wanted]);
  return wanted ? items : NONE;
}

/** The page's places: the Earth's page and the hubs it lists, each with its name. */
export interface TrendPlaces extends WorldPlaces {
  readonly worlds: readonly (WorldPlaces["worlds"][number] & { readonly name: string })[];
}

// A trend's world as the page names and links it, or none.
function placeOf(item: Trend, places: TrendPlaces): { name: string; path: string } | undefined {
  if (item.world === EARTH) return { name: "Earth", path: places.earth };
  if (item.kind === "rising") {
    const hub = places.worlds.find(({ slug }) => slug === item.world);
    return hub === undefined ? undefined : { name: hub.name, path: hub.path };
  }
  const name = places.worlds.find((hub) => hubWorldOf(hub) === item.world)?.name ?? item.title;
  const path = pagesOf([{ id: item.world, realms: [{ path: item.realm }] }], places).get(item.world);
  return path === undefined ? undefined : { name, path };
}

const callsOf = (calls: number): string => `${String(calls)} ${calls === 1 ? "call" : "calls"}`;

// A placed trend's words and the source its link says.
function wordsOf(item: Trend, name: string, now: Date): Pick<TickerItem, "text" | "source"> {
  const at = stampOf(item.at, now);
  if (item.kind === "trending") {
    const since = stampOf(item.since, now);
    return {
      text: `${name} · ${callsOf(item.calls)} since ${since}`,
      source: `Calls to its realms, as the chain's indexer counts them, from ${since} to ${at}`,
    };
  }
  if (item.kind === "rising")
    return {
      text: `${name} · +${String(Math.round(item.rise * 100))}% on its usual hour`,
      source: `People in its rooms against its usual hour of the last 14 days, at ${at}`,
    };
  return { text: `${name} · first seen ${at}`, source: `First on the chain's list of realms at ${at}` };
}

/** The ticker's items of the server's trends, in its order, read at `now`. */
export function trendItems(items: readonly Trend[], places: TrendPlaces, now: Date): TickerItem[] {
  return items.flatMap((item) => {
    const place = placeOf(item, places);
    if (place === undefined) return [];
    return [{ id: `trend-${item.kind}`, kind: item.kind, link: place.path, ...wordsOf(item, place.name, now) }];
  });
}
