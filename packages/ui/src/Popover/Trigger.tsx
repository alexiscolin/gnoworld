import type { ReactNode, Ref } from "react";
import { iconLook, iconSize, type IconControlSize } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import buttonStyles from "../Button/Button.module.css";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

interface Attrs {
  ref: Ref<HTMLButtonElement>;
  popoverTarget: string;
  "aria-haspopup": "dialog" | "menu";
}

// What opens a popover's panel: the button look as given, the plain class alone (words as they are), or an icon-only
// IconButton's look (plain unless it says) named by the label, in a tooltip. A function, not a component: the compiler's memo
// cache of it weighed 100 B gzipped on the home's first screen, and its caller's already holds this JSX's.
export function triggerButton({
  attrs,
  plain,
  icon,
  tabbable,
  label,
  busy = false,
  children,
}: {
  attrs: Attrs;
  plain: boolean;
  icon: { name: IconName; size: IconControlSize; emphasis?: "outline" | "plain"; tool?: boolean } | undefined;
  tabbable: boolean;
  label: string;
  /** Its words' work is going on: a spinner after them and aria-busy; the menu's words only, never an icon's. */
  busy?: boolean | undefined;
  children: ReactNode;
}) {
  const stop = tabbable ? {} : { tabIndex: -1 };
  if (icon !== undefined) {
    return (
      <Tooltip label={label}>
        <button
          type="button"
          {...attrs}
          {...iconLook(icon.emphasis ?? "plain", icon.size, icon.tool)}
          aria-label={label}
          {...stop}
        >
          <Icon name={icon.name} size={iconSize(icon.size)} />
        </button>
      </Tooltip>
    );
  }
  const { ref, popoverTarget, "aria-haspopup": haspopup } = attrs;
  const own = plain ? { ref, popoverTarget, "aria-haspopup": haspopup, className: "bare" } : attrs;
  return (
    <button type="button" {...own} {...stop} aria-busy={busy ? true : undefined}>
      {children}
      {busy ? <span className={buttonStyles["spinner"]} aria-hidden="true" /> : null}
    </button>
  );
}
