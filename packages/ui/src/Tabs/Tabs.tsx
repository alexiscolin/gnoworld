import type { KeyboardEvent } from "react";
import { pill } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { rove } from "../roving.ts";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import badge from "../Button/Button.module.css";
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
  /** Small: tighter tabs, for a narrow panel's row (the bell's kinds, frames 86, 87). */
  size?: "s" | "m";
}

/** A tablist with one tab reached by the keyboard, the selected one; the arrows move and select, round
 * the ends and turned round right to left, and Home and End go to the ends (WAI-ARIA's tabs). */
export function Tabs({ label, tabs, selected, onSelect, iconOnly = false, size = "m" }: TabsProps) {
  const reached = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selected),
  );
  // Right to left, the arrows turn round.
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const to = rove(event, "[role='tab']", rtl ? ["ArrowRight", "ArrowLeft"] : ["ArrowLeft", "ArrowRight"]);
    const tab = to === undefined ? undefined : tabs[to];
    if (tab !== undefined) onSelect(tab.id);
  };
  return (
    <div role="tablist" aria-label={label} className={styles["tabs"]} data-size={size} onKeyDown={move}>
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
                <span className={`${String(badge["badge"])} ${String(styles["count"])}`}>{tab.count}</span>
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
