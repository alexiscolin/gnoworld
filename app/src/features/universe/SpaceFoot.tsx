// What stands at the foot of a page that shows space: the planets' credits, and where the device waits to be asked (a phone, a reader who
// saves data; ADR-0002 §8), "View in space"; where space cannot run, why not.
import { Button } from "@gnoworld/ui";
import { useSyncExternalStore } from "react";
import { Credits } from "./Credits.tsx";
import { offer, press } from "./space.ts";
import styles from "./Universe.module.css";

const SORRY = "Space is not available here. Every place is in the list.";
const stateOf = () => offer.state;
const undecided = () => "undecided" as const;

export function SpaceFoot() {
  const state = useSyncExternalStore(offer.heard.subscribe, stateOf, undecided);
  return (
    <>
      {state === "taken" ? <Credits /> : null}
      {state === "ask" ? (
        <div className={[styles["offer"], "enter"].join(" ")}>
          <Button onClick={press}>View in space</Button>
        </div>
      ) : null}
      <p role="status" className={["meta", styles["status"]].join(" ")}>
        {state === "failed" ? SORRY : null}
      </p>
    </>
  );
}
