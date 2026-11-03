// The way back from a system the scene's eye rests at (part 7v; Alexis, 2026-11-03, the GUI board's option B): a card under the header, at the
// screen's top left, frame 45's kicker "← Cosmos › System" over the system's name, the page's heading while the hero gives way, then its worlds
// and its network. The kicker's first step, or Escape, goes a step back to the cosmos's view at rest; a system's view is no page of its own,
// so the step acts, and no link changes the page.
import { labelName } from "@gnoworld/core";
import { Address, shortAddress } from "@gnoworld/schemas";
import { Breadcrumb } from "@gnoworld/ui";
import { useEffect } from "react";
import { site } from "../../places.ts";
import { keyHeld } from "../../scene/keyHeld.ts";
import { useResting, useRestingWorlds } from "./views.ts";
import styles from "./Universe.module.css";

// A system by its namespace's own name, an address one as a line shows it, in its own case (7v's review).
const nameOf = (system: string) =>
  Address.safeParse(system).success ? shortAddress(system) : (labelName(system) ?? system);

// The scene shows the default universe's cosmos alone.
const network = () => site.universes.find(({ isDefault }) => isDefault)?.name ?? "";

export function SystemCrumb({ back }: { back: () => void }) {
  const system = useResting();
  const worlds = useRestingWorlds();
  useEffect(() => {
    if (system === undefined) return;
    const controller = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && !event.defaultPrevented && !keyHeld(event)) back();
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
    };
  }, [system, back]);
  const about = `${String(worlds)} ${worlds === 1 ? "world" : "worlds"} · a namespace on ${network()}`;
  return system === undefined ? null : (
    <div className={`${styles["underHeader"] ?? ""} ${styles["crumb"] ?? ""}`}>
      <Breadcrumb label="Where you are" items={[{ label: "Cosmos", onSelect: back }, { label: "System" }]} />
      <h1 className={styles["system"]}>{nameOf(system)}</h1>
      <p className={styles["about"]}>{about}</p>
    </div>
  );
}
