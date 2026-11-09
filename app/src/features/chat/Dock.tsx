// What goes under a room's lines (moved out of QuickActions.tsx): a world's pinned actions over what writes (the composer, or a visitor's
// word); and the quick actions the composer's + opens, the place's own: a direct message's, the Earth's, a world's with a realm or without.
import type { ReactNode } from "react";
import { realmView } from "../../places.ts";
import type { AppState } from "../../store/index.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import type { Shown } from "./shown.tsx";
import { QuickActions, type Pinned, type QuickActionsProps } from "./QuickActions.tsx";
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

export interface DockProps {
  /** The calls the world's team pins (D271): their pills in a row over what writes, and the cards they open over it. */
  pinned?: Pinned | undefined;
  children: ReactNode;
}

export function Dock({ pinned, children }: DockProps) {
  return (
    <div className={styles["dock"]}>
      {pinned === undefined ? null : (
        <>
          <div className={styles["cards"]}>{pinned.cards}</div>
          <div role="toolbar" aria-label="Pinned actions" className={styles["bar"]}>
            <span className={styles["pinned"]}>{pinned.pills}</span>
          </div>
        </>
      )}
      {children}
    </div>
  );
}

/** The quick actions of the conversation in view, which its composer's + opens: a direct message's or the place's, Poll for an account. */
export function quickActionsOf(place: ChatPlace, shown: Shown, session: AppState["login"]["session"]): ReactNode {
  return (
    <QuickActions
      pills={pillsOf(place, shown.kind === "dm")}
      realm={realmOf(place)}
      poll={session.kind === "in" ? { room: shown.writer.room, nick: session.address, say: shown.say } : undefined}
    />
  );
}
