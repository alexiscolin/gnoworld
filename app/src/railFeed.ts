// What the rail reads (7i): the worlds' file, and who is here, asked at once and each minute while a rail shows (the server's answer keeps a
// minute too), never while the tab is hidden; the names and visits first, never waiting on the server (F3778).
import { createStore } from "zustand/vanilla";
import type { CosmosWorld } from "./space/cosmosWorld.ts";
import type { Known } from "./railWorlds.ts";
import type { WorldSignals } from "./features/universe/signals.ts";
import { worldsFile } from "./worldsFile.ts";

const PRESENCE_MS = 60_000;
const loadSignals = () => import("./features/universe/signals.ts");
const known = createStore<Known | undefined>(() => undefined);

/** Hears each change of what `data` gives; what it returns lets go. */
export const subscribe = known.subscribe;
/** The worlds and what is known of them, once both are. */
export const data = known.getState;

/** Feeds the rail until `leaving` aborts. */
export function feed(leaving: AbortSignal): void {
  let [worlds, signals, heard] = [undefined as readonly CosmosWorld[] | undefined, known.getState()?.signals, false];
  const tell = () => {
    if (worlds !== undefined && signals !== undefined && !leaving.aborted)
      known.setState({ worlds, signals, ...(heard ? {} : { unheard: true as const }) }, true);
  };
  const heardNow = (read: WorldSignals | undefined) => {
    if (read === undefined) return;
    [signals, heard] = [read, true];
    tell();
  };
  // A read that fails leaves the rail as it stood: the file's worlds with no count, or what the last minute said.
  worldsFile().then((file) => {
    worlds = file?.worlds ?? [];
    tell();
  }, tell);
  const ask = () => {
    loadSignals()
      .then(({ localSignals, readSignals }) => {
        signals ??= localSignals(Date.now());
        tell();
        return readSignals();
      })
      .then(heardNow, tell);
  };
  const whileSeen = () => {
    if (!document.hidden) ask();
  };
  const timer = setInterval(whileSeen, PRESENCE_MS);
  document.addEventListener("visibilitychange", whileSeen, { signal: leaving });
  leaving.addEventListener("abort", () => {
    clearInterval(timer);
  });
  ask();
}
