import type { KeyboardEvent } from "react";
import { pill } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import styles from "./Tabs.module.css";

export interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: IconName;
}

export interface TabsProps {
  label: string;
  tabs: Tab[];
  /** The selected tab's id, or null for none: a view the tabs only lead to. */
  selected: string | null;
  onSelect: (id: string) => void;
  /** Icons alone, each tab named by its label and wearing it as a tooltip. */
  iconOnly?: boolean;
}

interface Place {
  at: number;
  last: number;
  // 1 left to right; -1 right to left, where the arrows turn round.
  ahead: number;
}

// The keys the tablist takes, as the tab they go to from the focused one.
const MOVES: Record<string, (place: Place) => number> = {
  ArrowRight: ({ at, ahead }) => at + ahead,
  ArrowLeft: ({ at, ahead }) => at - ahead,
  Home: () => 0,
  End: ({ last }) => last,
};

/** A tablist with one tab reached by the keyboard, the selected one; the arrows move and select, round
 * the ends and turned round right to left, and Home and End go to the ends (WAI-ARIA's tabs). */
export function Tabs({ label, tabs, selected, onSelect, iconOnly = false }: TabsProps) {
  const reached = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selected),
  );
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const go = MOVES[event.key];
    const all = [...event.currentTarget.querySelectorAll<HTMLElement>("[role='tab']")];
    const at = all.indexOf(event.target as HTMLElement);
    if (go === undefined || at === -1) return;
    event.preventDefault();
    const ahead = getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1;
    const to = (go({ at, last: all.length - 1, ahead }) + all.length) % all.length;
    const tab = tabs[to];
    if (tab === undefined) return;
    onSelect(tab.id);
    all[to]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={styles["tabs"]} onKeyDown={move}>
      {tabs.map((tab, at) => {
        const counted = tab.count !== undefined && tab.count > 0;
        const name = counted ? `${tab.label} ${String(tab.count)}` : tab.label;
        const button = (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={pill(styles["tab"])}
            aria-selected={tab.id === selected}
            aria-label={iconOnly ? name : undefined}
            tabIndex={at === reached ? 0 : -1}
            onClick={() => {
              onSelect(tab.id);
            }}
          >
            {tab.icon === undefined ? null : <Icon name={tab.icon} />}
            {iconOnly ? null : tab.label}
            {counted ? (
              <>
                {" "}
                <span className={styles["count"]}>{tab.count}</span>
              </>
            ) : null}
          </button>
        );
        return iconOnly ? (
          <Tooltip key={tab.id} label={tab.label}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
