// The way back from a system the scene's eye rests at (part 7v; Alexis, 2026-11-03): a crumb, "← Cosmos › gnoswap", as frame 45's kicker,
// at the screen's top left, whose first step, or Escape, goes a step back to the cosmos's view at rest. A system's view is no page of its own,
// so the step acts, and no link changes the page.
import { Breadcrumb } from "@gnoworld/ui";
import { useEffect } from "react";
import { keyHeld } from "../../scene/keyHeld.ts";
import { useResting } from "./views.ts";
import styles from "./Universe.module.css";

export function SystemCrumb({ back }: { back: () => void }) {
  const system = useResting();
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
  return system === undefined ? null : (
    <div className={`${styles["underHeader"] ?? ""} ${styles["crumb"] ?? ""}`}>
      <Breadcrumb label="Where you are" items={[{ label: "Cosmos", onSelect: back }, { label: system }]} />
    </div>
  );
}
