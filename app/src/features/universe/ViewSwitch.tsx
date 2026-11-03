// The views of space in the header (part 7v; Alexis, 2026-11-03, the GUI board's option B): two icons after Earth, Cosmos and List, which say
// where one looks, for how one looks, Dynamic or the Plan; each names itself on hover and to a screen reader, and V toggles them. The Plan's
// second click on a world's name comes here as an event, which the router follows to the site's own page and nowhere else.
import { IconButton } from "@gnoworld/ui";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { keyHeld } from "../../scene/keyHeld.ts";
import { isOwnPage } from "../../pagePath.ts";
import { OPEN } from "../../scene/openEvent.ts";
import { useSeeing, views } from "./views.ts";
import styles from "./ViewSwitch.module.css";

export function ViewSwitch() {
  const seeing = useSeeing();
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        const chord = event.metaKey || event.ctrlKey || event.altKey;
        if (event.key.toLowerCase() !== "v" || chord || event.defaultPrevented || keyHeld(event)) return;
        views.toggle();
      },
      { signal: controller.signal },
    );
    window.addEventListener(
      OPEN,
      (event) => {
        const href: unknown = event instanceof CustomEvent ? event.detail : undefined;
        if (typeof href === "string" && isOwnPage(href))
          Promise.resolve(navigate(href)).catch((error: unknown) => {
            reportError(error);
          });
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
    };
  }, [navigate]);
  return (
    <span role="group" aria-label="Views of space" className={styles["switch"]}>
      <IconButton
        icon="cluster"
        label="Dynamic view"
        emphasis="plain"
        pressed={seeing === "dynamic"}
        onClick={() => {
          views.see("dynamic");
        }}
      />
      <IconButton
        icon="planet"
        label="Plan view"
        emphasis="plain"
        pressed={seeing === "plan"}
        onClick={() => {
          views.see("plan");
        }}
      />
    </span>
  );
}
