// Every hub's main room and every listed realm's room, made ahead (D413), a few a second so Ergo's datastore and the loop are never
// hit at once (the bot is nofakelag: no flood guard to trip). Hubs first, then the worlds file's realms, busiest world first, read once
// for the route too and again only when the job has written it anew. One pass at a time; a pass that did not finish is made again by
// the next check, even for the same file; stopping ends a wait at once.
import { realmRoom } from "@gnoworld/core";
import type { Log } from "@gnoworld/service/log";
import { remember } from "../remember.ts";
import { worldsListing, type Listing } from "../worlds/known.ts";
import type { Rooms } from "./create.ts";

const PER_SECOND = 10;
// The paths whose room name is kept: a set far past it is hashed again, never held whole.
const ROOM_KEYS = 100_000;

export interface AheadOptions {
  /** The worlds job's file. */
  file: string;
  rooms: Rooms;
  hubs: readonly { readonly slug: string; readonly realms?: readonly string[] | undefined }[];
  log: Log;
  /** Waits `ms` between two batches, ending early when the signal aborts. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** The worlds file read once for the route too; the file alone when none. */
  listing?: Pick<Listing, "paths" | "stamp">;
  /** A realm's room, core's realmRoom unless a test counts the calls. */
  roomOf?: typeof realmRoom;
  /** The paths whose room is kept in memory. */
  roomKeys?: number;
  /** The rooms made a second. */
  perSecond?: number;
}

export interface Ahead {
  /** Makes the rooms the file lists and the hubs' main rooms that do not exist; the file is read again only when it changed. */
  check: () => Promise<void>;
  stop: () => void;
}

// A timer on the global clock, ended early by the signal: an abort is no fault, so nothing rejects.
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export function aheadRooms(options: AheadOptions): Ahead {
  const { file, rooms, hubs, log, wait = sleep, perSecond = PER_SECOND, roomOf = realmRoom } = options;
  const { listing = worldsListing(file), roomKeys = ROOM_KEYS } = options;
  const stopper = new AbortController();
  let finished: number | undefined;
  let running: Promise<void> | undefined;
  const named = new Map<string, string>();
  const roomFor = (path: string): string => {
    const known = named.get(path);
    if (known !== undefined) return known;
    const { room } = roomOf(path, hubs);
    remember(named, [path, room], roomKeys);
    return room;
  };
  // Each listed room's realm (the first listed, for versions sharing one room), told to rooms made before their path was kept.
  const realmsListed = (): Map<string, string> => {
    const pathOf = new Map<string, string>();
    for (const path of listing.paths()) if (!pathOf.has(roomFor(path))) pathOf.set(roomFor(path), path);
    for (const [room, path] of pathOf) rooms.tagRealm(room, path);
    return pathOf;
  };
  const pass = async (): Promise<void> => {
    const at = listing.stamp();
    if (at !== undefined && at === finished) return;
    const pathOf = realmsListed();
    // The rooms to make, hubs first, each once.
    const wanted = [...new Set([...hubs.map(({ slug }) => `#${slug}`), ...pathOf.keys()])];
    const todo = wanted.filter((room) => !rooms.exists(room));
    for (const [made, room] of todo.entries()) {
      if (made > 0 && made % perSecond === 0) await wait(1_000, stopper.signal);
      if (stopper.signal.aborted) return;
      if (rooms.realm(room, undefined, pathOf.get(room)) === "full") {
        // Never silently: how many rooms the cap left unmade.
        log("rooms_ahead_full", { value: todo.slice(made).filter((left) => !rooms.exists(left)).length });
        break;
      }
    }
    finished = at;
  };
  return {
    check: () => {
      if (stopper.signal.aborted) return Promise.resolve();
      running ??= pass()
        .catch((error: unknown) => {
          log("rooms_ahead_failed", { error: error instanceof Error ? error.name : "unknown" });
        })
        .finally(() => {
          running = undefined;
        });
      return running;
    },
    stop: () => {
      stopper.abort();
    },
  };
}
