// What a plate is given ahead of the click (slice 13), in a chunk of its own: asked by plateWarm.ts once the page's space has drawn, or at a link's
// intent. Every read here is the page's own, kept (lib/query): the plate finds the answer asked, or the answer already come.
import { hubWorldOf } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { HOME_NAMESPACES, isHome } from "./cosmosAt.ts";
import { realmPageQuery } from "./features/realms/useRealm.ts";
import { realmFacts } from "./features/realms/useRealmFacts.ts";
import { worldsFile } from "./worldsFile.ts";
import { realmFunctions } from "./lib/chain/rpc.ts";
import { rollupOptions } from "./lib/chain/rollupQuery.ts";
import { queryClient, quietUnread } from "./lib/query/client.ts";
import { fastLink } from "./lib/saveData.ts";
import { realmAt } from "./realmAt.ts";
import { site } from "./places.ts";

// The plate's code, for every world: its adapters and the blocks they share, asked once; a dynamic import of a module the routes also ask is
// the same request.
let chunks: Promise<unknown> | undefined;
const warmChunks = (): void => {
  chunks ??= Promise.all([
    import("./routes/plate/RealmPlate.tsx"),
    import("./routes/plate/EarthPlate.tsx"),
    import("./routes/plate/HubPlate.tsx"),
  ]);
  chunks.catch(() => {
    chunks = undefined;
  });
};

const AHEAD_MOST = 8;
const AT_ONCE = 2;

type World = Worlds["worlds"][number];
const calls = (world: World): number => world.realms[0]?.calls ?? 0;

// The worlds of the view, a system's own or the galaxy's, the largest first by their first realm's calls, whose realm a click opens; hubs have their
// own page, which reads no rollup.
function inView(worlds: readonly World[], place: { kind: string; id: string }): World[] {
  const hubs = new Set(site.universeAt(location.pathname).worlds.map(hubWorldOf));
  const mine = (world: World) =>
    place.kind === "universe" ||
    (isHome(place.id) ? HOME_NAMESPACES.includes(world.namespace) : world.namespace === place.id);
  return worlds
    .filter((world) => world.realms.length > 0 && !hubs.has(world.id) && mine(world))
    .sort((a, b) => calls(b) - calls(a))
    .slice(0, AHEAD_MOST);
}

/** The idle batch: the plate's code, then the rollup of each world in view, two at a time, till `signal` aborts (the view changed) or the tab hides. */
export async function warmBatch(place: { kind: string; id: string }, signal: AbortSignal): Promise<void> {
  if (!fastLink()) return;
  warmChunks();
  if (place.kind !== "system" && place.kind !== "universe") return;
  const file = await worldsFile();
  const queue = inView(file?.worlds ?? [], place).flatMap((world) => world.realms[0]?.path ?? []);
  const work = async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      if (signal.aborted || document.hidden) return;
      await queryClient.query(rollupOptions(import.meta.env.BASE_URL, path)).catch(quietUnread);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, work));
}

// The chain is shared and public: what an intent asks of it is capped, so a pointer swept over a list floods nothing (the plan's §3).
const INTENTS_MOST = 12;
const INTENTS_WINDOW_MS = 60_000;
const intents: number[] = [];
function allowed(): boolean {
  const now = Date.now();
  while (intents.length > 0 && now - (intents[0] ?? now) > INTENTS_WINDOW_MS) intents.shift();
  if (intents.length >= INTENTS_MOST) return false;
  intents.push(now);
  return true;
}

/** The reads of the realm a link names, on intent: its page and height, its functions, its facts and its rollup. A press or a touch goes through the
 * cap, as the click's own reads would. */
export function warmRealm(pathname: string, pressed: boolean): void {
  const found = realmAt(pathname);
  if (found === undefined || (!pressed && !allowed())) return;
  const { realm, chain } = found;
  warmChunks();
  // The page's own read says a failure when it asks; an ask ahead that failed says nothing (TanStack's prefetching guide: `.catch(noop)`).
  const ahead = (read: Promise<unknown>) => void read.catch(quietUnread).catch(reportError);
  ahead(queryClient.query(realmPageQuery({ rpc: chain.rpc, realm, origin: chain.gnoweb })));
  ahead(queryClient.query(realmFunctions(chain.rpc, realm)));
  ahead(queryClient.query(realmFacts(chain.indexer, realm)));
  ahead(queryClient.query(rollupOptions(import.meta.env.BASE_URL, realm)));
}
