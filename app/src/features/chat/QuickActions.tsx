// The row of quick actions over the composer (the video's frame 23.58.01, bottom): only what works today, and the world's pinned
// actions (D271), whose cards open over the row. Quiz and Poll wait for phase 1; Calendar for its data and its own slice.
import { Suspense, useId, type ComponentType } from "react";
import type { PinnedRow } from "../../pinned.ts";
import styles from "./QuickActions.module.css";

/** What the pills and the cards of a world's pinned actions are given: the rows, the world's universe, the bar's own id and its look. */
export interface PinnedBarProps {
  actions: readonly PinnedRow[];
  universe: { id: string; isDefault: boolean };
  at: string;
  className: string;
}

/** A world's pinned actions (D271): the rows, and the pills and cards the world hands the chat, whose code it asks after hydration. */
export interface Pinned extends Pick<PinnedBarProps, "actions" | "universe"> {
  Pills: ComponentType<PinnedBarProps>;
  Cards: ComponentType<Omit<PinnedBarProps, "className">>;
}

export interface QuickActionsProps {
  onWhoIsHere: () => void;
  /** The world's pinned actions, none for most worlds. */
  pinned?: Pinned | undefined;
}

// One pill of the row: an edge, the words centred, the row's width shared among the pills.
function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles["action"]} onClick={onClick}>
      {label}
    </button>
  );
}

export function QuickActions({ onWhoIsHere, pinned }: QuickActionsProps) {
  const barId = useId();
  return (
    <>
      {pinned === undefined ? null : (
        <Suspense fallback={null}>
          <pinned.Cards actions={pinned.actions} universe={pinned.universe} at={barId} />
        </Suspense>
      )}
      <div role="toolbar" aria-label="Quick actions" className={styles["bar"]}>
        <Action label="Who's here" onClick={onWhoIsHere} />
        {pinned === undefined ? null : (
          <Suspense fallback={null}>
            <pinned.Pills
              actions={pinned.actions}
              universe={pinned.universe}
              at={barId}
              className={styles["action"] ?? ""}
            />
          </Suspense>
        )}
      </div>
    </>
  );
}
