// "Here, right now" and "messages now" (frames 26, 40, 93): the people the chat's rooms list once the page has connected, and the rate the
// server's history gives (useHours.ts). Before either, the store holds nothing to say: no fact is drawn, never a 0, its place kept empty.
// The Earth says "talking" with the countries online, and stands its realms deployed in 24 h beside (`beside`, slice 9's coming soon).
import { Grid } from "@gnoworld/ui";
import { lazy, Suspense, type ReactNode } from "react";
import type { AppState } from "../../store/index.ts";
import { useApp } from "../../storeContext.tsx";
import styles from "./Here.module.css";

// The facts' figures come in their own chunk, once there is one to draw: the first screen does not pay for them.
const Facts = lazy(() => import("./Facts.tsx").then(({ Facts }) => ({ default: Facts })));

const people = ({ chat }: AppState) =>
  chat.me === undefined ? 0 : new Set(Object.values(chat.rooms).flatMap((room) => room.members)).size;

export interface HereProps {
  /** The messages an hour now, when the server said. */
  perHour?: number | undefined;
  /** The people's words: "here" and "right now" unless the place says otherwise (the Earth's "talking"). */
  unit?: string;
  caption?: string;
  /** A fact of another source in the second column, drawn at once. */
  beside?: ReactNode;
}

export function Here({ perHour, unit, caption, beside }: HereProps) {
  const here = useApp(people);
  const counted = here > 0 || perHour !== undefined;
  const drawn = counted || beside !== undefined;
  // Under the plate's breakpoint the place is the fact's height, drawn or not: the count comes after the door and the chat (7e), and nothing
  // under it moves. The place holds no child while no fact is drawn, so the stylesheet frees it from 1,280 px.
  return (
    <div className={styles["here"]}>
      {drawn ? (
        <Grid min="s" space="m">
          {counted ? (
            <Suspense fallback={null}>
              <Facts
                here={here === 0 ? undefined : here}
                perHour={perHour}
                {...(unit === undefined ? {} : { unit })}
                {...(caption === undefined ? {} : { caption })}
              />
            </Suspense>
          ) : null}
          {beside}
        </Grid>
      ) : null}
    </div>
  );
}
