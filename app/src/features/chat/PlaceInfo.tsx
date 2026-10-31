// The full-screen chat's info panel (the video's frame 23.58.01, right): the place's kicker and name, what it says of itself,
// then Here now. Only what the page holds: the video's sample figures are never drawn.
import { Kicker, Stack } from "@gnoworld/ui";
import type { ReactNode, Ref } from "react";
import styles from "./PlaceInfo.module.css";

export interface PlaceInfoProps {
  kicker: string;
  name: string;
  description: string;
  /** How many are talking here now: none draws no figure (the video's other figure, its countries, waits for the data). */
  talking?: number | undefined;
  /** Who is here, drawn under Here now. */
  here: ReactNode;
  /** Takes the focus from code, as Who's here moves the reader to the list. */
  panelRef?: Ref<HTMLElement>;
}

export function PlaceInfo({ kicker, name, description, talking, here, panelRef }: PlaceInfoProps) {
  return (
    <aside ref={panelRef} tabIndex={-1} aria-label={name} className={styles["panel"]}>
      <Stack space="xs">
        <Kicker>{kicker}</Kicker>
        <h2 className={styles["name"]}>{name}</h2>
        <p className={styles["about"]}>{description}</p>
        {talking === undefined ? null : (
          <div className={styles["stats"]}>
            {/* The figure and its caption, as ui's Stat sets them, without its count-up, which the first screen's budget cannot carry. */}
            <p className={styles["figure"]}>{talking}</p>
            <p className="label">Talking now</p>
          </div>
        )}
        <section className={styles["here"]}>
          <Stack space="2xs">
            <h3 className="label">Here now</h3>
            {here}
          </Stack>
        </section>
      </Stack>
    </aside>
  );
}
