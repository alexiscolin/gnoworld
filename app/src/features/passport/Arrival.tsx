// A place's arrival (slice 8; frames 23, 37, 93, 104): its first visit stamps the passport and says so in the top centre's pill,
// "Stamped · GovDAO / 2 stamps in your passport", with the passport a press away; a world this device charted first says "First to chart",
// as the scene wakes it. 8b's line ("Today's expedition · 1 of 3") stands in the same pill, never a second one, and alone for a place
// already stamped (slots.tsx). One pill at a time: the shell's (topPill.tsx).
import { markFirst, stampedIn, stampKey, utcDay } from "@gnoworld/core";
import { useEffect, useEffectEvent } from "react";
import { useDeviceView } from "../../deviceViews.ts";
import { worldName } from "../expedition/index.ts";
import { slot } from "../../slots.tsx";
import { raisePill } from "../../topPill.tsx";
import { useApp, useAppStore } from "../../storeContext.tsx";

export interface ArrivalProps {
  readonly universe: string;
  /** The world's id as the cosmos holds it (a hub's is its first realm's): the passport's key. */
  readonly world: string;
  readonly name: string;
  /** The place's page, which a share links to. */
  readonly path: string;
}

const stampsSaid = (count: number) => `${String(count)} ${count === 1 ? "stamp" : "stamps"} in your passport`;

export function Arrival({ universe, world, name: given, path }: ArrivalProps) {
  // The world's display name, the one the expedition says too (a realm's "Connect 4", not its folder's "connect4"); the page's otherwise.
  const name = worldName(universe, world) ?? given;
  const store = useAppStore();
  const readable = useApp(({ device }) => device.readable);
  const [, open] = useDeviceView();
  // The pill's one act: the passport, or for a world charted first, its share when 8c's is plugged in.
  const say = useEffectEvent((title: string, line: string, shared = false) => {
    const share = shared ? slot("share") : undefined;
    raisePill({
      title,
      line,
      action:
        share === undefined
          ? {
              label: "Passport",
              onAction: () => {
                open("passport");
              },
            }
          : {
              label: "Share",
              onAction: () => {
                share({ name, path });
              },
            },
    });
  });
  // Once the device has been read: a stamp written before would be one the device already held.
  useEffect(() => {
    if (!readable) return;
    const key = stampKey(universe, world);
    const day = utcDay(new Date());
    const stamped = !Object.hasOwn(store.getState().device.stamps, key);
    if (stamped) store.getState().deviceActions.change("stamps", (held) => markFirst(held, key, day));
    const count = stampedIn(store.getState().device.stamps, universe).size;
    let here = true;
    const line = slot("arrivalLine");
    (line === undefined
      ? Promise.resolve(undefined)
      : line({ key, universe, name, day, stamped }, store.getState().deviceActions.change)
    )
      .then((said) => {
        if (!here) return;
        if (stamped) say(`Stamped · ${name}`, said ?? stampsSaid(count));
        else if (said !== undefined) say(name, said);
      })
      .catch(reportError);
    // The scene wakes an uncharted world on the visit that stamped it: this device charted it first.
    const unheard = store.subscribe(({ device }, before) => {
      if (stamped && Object.hasOwn(device.charted, key) && !Object.hasOwn(before.device.charted, key))
        say(`First to chart · ${name}`, "Charted first on this device", true);
    });
    return () => {
      here = false;
      unheard();
    };
  }, [store, readable, universe, world, name]);
  return null;
}
