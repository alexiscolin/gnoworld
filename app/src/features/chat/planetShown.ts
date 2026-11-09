// Whether this device shows the full chat's small planet (PlaceView.tsx), kept as a flag: shown unless it was hidden. An external store, so the
// server and the first client render agree on shown.
import { useSyncExternalStore } from "react";
import { Heard } from "../../lib/heard.ts";
import { readFlag, writeFlag } from "../../lib/flags.ts";

const KEY = "gnoworld:chat-planet";
const heard = new Heard();
let current: boolean | undefined;

function snapshot(): boolean {
  current ??= readFlag(KEY) !== "off";
  return current;
}

/** Whether the planet shows, and the way to show or hide it: held in memory at once, kept on the device where it lets. */
export function usePlanetShown(): readonly [boolean, (shown: boolean) => void] {
  const shown = useSyncExternalStore(heard.subscribe, snapshot, () => true);
  return [
    shown,
    (next) => {
      current = next;
      writeFlag(KEY, next ? "on" : "off");
      heard.tell();
    },
  ];
}
