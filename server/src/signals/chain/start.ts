// The chain's rooms on the server (slice 9g): for each universe of the data with a public indexer, one subscription (follow.ts),
// its catch-up and its 24 h count (indexer.ts, count.ts), relayed on the stream (relay.ts). Nothing is stored; a universe whose
// indexer has no address a socket may go to over TLS is skipped, said. Stopped with the server: every socket closed.
import { jsonOf } from "@gnoworld/core";
import { Hubs, Universes } from "@gnoworld/schemas";
import { readDataFile } from "@gnoworld/service/files";
import type { Log } from "@gnoworld/service/log";
import type { Send } from "@gnoworld/service/net";
import { loadRealmCount, type Deploy } from "./count.ts";
import { followChain, timer, type ChainSocket, type FollowOptions } from "./follow.ts";
import { indexerReaders } from "./indexer.ts";
import { makeRelay, type RelayOptions } from "./relay.ts";
import { socketUrl, watchOf } from "./watch.ts";

type Universe = ReturnType<typeof Universes.parse>[number];

export interface ChainOptions {
  universes: Universe[];
  hubs: ReturnType<typeof Hubs.parse>;
  stream: RelayOptions["stream"];
  log: Log;
  now: () => number;
  open?: FollowOptions["open"];
  send?: Send;
  wait?: FollowOptions["wait"];
  random?: () => number;
  after?: NonNullable<FollowOptions["after"]>;
}

/** The count is asked again this often while the indexer could not give it. */
export const RETRY_MS = 60_000;

/** The universes' and the hubs' data, through the data's own schemas; throws, naming the file and nothing it held, on one that is no good. */
export function readChainData(universes: string, hubs: string): Pick<ChainOptions, "universes" | "hubs"> {
  const read = (name: string, file: string): unknown => {
    try {
      return jsonOf(readDataFile(file));
    } catch (cause) {
      throw new Error(`${name}: ${file} cannot be read`, { cause });
    }
  };
  const parsedUniverses = Universes.safeParse(read("universes", universes));
  const parsedHubs = Hubs.safeParse(read("hubs", hubs));
  if (!parsedUniverses.success) throw new Error(`universes: ${universes} does not hold a good list`);
  if (!parsedHubs.success) throw new Error(`hubs: ${hubs} does not hold a good list`);
  return { universes: parsedUniverses.data, hubs: parsedHubs.data };
}

const openSocket = (url: string, protocol: string): ChainSocket => new WebSocket(url, protocol);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function startChain(options: ChainOptions): { stop: () => void } {
  const {
    stream,
    log,
    now,
    hubs,
    open = openSocket,
    send,
    wait = sleep,
    random = Math.random,
    after = timer,
  } = options;
  const stops: (() => void)[] = [];
  let stopped = false;
  for (const universe of options.universes) {
    const url = socketUrl(universe.indexer);
    const said = (what: string): void => {
      log(what, { reason: universe.id });
    };
    if (url === undefined) {
      said("chain_universe_skipped");
      continue;
    }
    const watch = watchOf(hubs, universe.id);
    // The newest deploy the day's history read: the follower starts from it, so a first socket that fails before any frame loses nothing.
    let reached: number | undefined;
    const readers = indexerReaders({
      url: universe.indexer,
      watch,
      log: said,
      ...(send === undefined ? {} : { send }),
    });
    const history = async (since: string): Promise<Deploy[]> => {
      const deploys = await readers.history(since);
      reached ??= deploys.reduce<number | undefined>((top, { height }) => Math.max(top ?? height, height), undefined);
      return deploys;
    };
    loadRealmCount({ history, now, log: said }).then(
      (count) => {
        if (stopped) return;
        // A history that could not load is asked again, so the Earth is not left without its count until a restart.
        const again = (): void => {
          if (count.known()) return;
          const cancel = after(RETRY_MS, () => {
            count.load().then(again, again);
          });
          stops.push(cancel);
        };
        again();
        const follow = followChain({
          universe: universe.id,
          url,
          watch,
          open,
          catchUp: (from) => readers.catchUp(from),
          wait,
          random,
          deliver: makeRelay({ stream, count, universe: universe.id, now }),
          ...(reached === undefined ? {} : { from: reached }),
          log: said,
          after,
        });
        stops.push(follow.stop);
        said("chain_following");
      },
      () => undefined,
    );
  }
  return {
    stop() {
      stopped = true;
      for (const stop of stops.splice(0)) stop();
    },
  };
}
