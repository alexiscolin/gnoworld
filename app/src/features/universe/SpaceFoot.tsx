// What stands at the foot of a page that shows space: the planets' credits, and where the device waits to be asked (a phone, a reader who
// saves data; ADR-0002 §8), "View in space"; where space cannot run, why not.
import { PHONE_QUERY } from "@gnoworld/core";
import { Button } from "@gnoworld/ui";
import { useEffect, useSyncExternalStore } from "react";
import { asksToSaveData } from "../../lib/saveData.ts";
import { Credits } from "./Credits.tsx";
import { gpuCanDraw } from "./gpu.ts";
import { offer, press } from "./space.ts";
import styles from "./Universe.module.css";

const SORRY = "Space is not available here. Every place is in the list.";
const stateOf = () => offer.state;
const undecided = () => "undecided" as const;

export function SpaceFoot() {
  const state = useSyncExternalStore(offer.heard.subscribe, stateOf, undecided);
  // The offer is decided once a session: a tab opened at a phone's width waits to be asked, and keeps waiting once widened. A computer's
  // window takes space by itself, so one that grows past the phone's width takes it then, unless the reader saves data or the GPU is weak.
  useEffect(() => {
    if (state !== "ask") return;
    const phone = matchMedia(PHONE_QUERY);
    const widened = () => {
      if (!phone.matches && !asksToSaveData() && gpuCanDraw()) press();
    };
    widened();
    phone.addEventListener("change", widened);
    return () => {
      phone.removeEventListener("change", widened);
    };
  }, [state]);
  return (
    <>
      {state === "taken" ? <Credits /> : null}
      {state === "ask" ? (
        <div className={[styles["offer"], "enter"].join(" ")}>
          <Button
            onClick={() => {
              press();
              // The button goes with the press: the focus it leaves goes to the page's heading, never to the document's start.
              document.querySelector<HTMLElement>("h1")?.focus();
            }}
          >
            View in space
          </Button>
        </div>
      ) : null}
      <p role="status" className={["meta", styles["status"]].join(" ")}>
        {state === "failed" ? SORRY : null}
      </p>
    </>
  );
}
