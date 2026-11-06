// What goes under a room's lines (moved out of QuickActions.tsx): the quick actions over what writes (the composer, or a visitor's
// word), the row the place's own: a direct message's, the Earth's, a world's with a realm or without.
import type { ReactNode } from "react";
import { realmView } from "../../places.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { QuickActions, type QuickActionsProps } from "./QuickActions.tsx";
import styles from "./QuickActions.module.css";

const pillsOf = (place: ChatPlace, dm: boolean): QuickActionsProps["pills"] => {
  if (dm) return "dm";
  if (place.earth === true) return "earth";
  return place.realms?.[0] === undefined ? "hub" : "realm";
};

// The world's first realm's view on the site, which Realm opens.
const realmOf = ({ realms, universe }: ChatPlace): string | undefined => {
  const realm = realms?.[0];
  return realm === undefined ? undefined : realmView(realm, universe);
};

export interface DockProps extends Pick<QuickActionsProps, "onWhoIsHere" | "writes"> {
  place: ChatPlace;
  /** A direct message in view: its own row. */
  dm: boolean;
  children: ReactNode;
}

export function Dock({ place, dm, onWhoIsHere, writes, children }: DockProps) {
  return (
    <div className={styles["dock"]}>
      <QuickActions
        onWhoIsHere={onWhoIsHere}
        world={place.slug}
        pills={pillsOf(place, dm)}
        realm={realmOf(place)}
        writes={writes}
      />
      {children}
    </div>
  );
}
