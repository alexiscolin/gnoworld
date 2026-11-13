import type { ReactNode, Ref } from "react";
import { iconLook, iconSize, type IconControlSize } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

interface Attrs {
  ref: Ref<HTMLButtonElement>;
  popoverTarget: string;
  "aria-haspopup": "dialog" | "menu";
}

// What opens a popover's panel: the button look as given, the plain class alone (words as they are), or an icon-only
// IconButton's look (plain unless it says) named by the label, in a tooltip.
export function Trigger({
  attrs,
  plain,
  icon,
  tabbable,
  label,
  children,
}: {
  attrs: Attrs;
  plain: boolean;
  icon: { name: IconName; size: IconControlSize; emphasis?: "outline" | "plain"; tool?: boolean } | undefined;
  tabbable: boolean;
  label: string;
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
    <button type="button" {...own} {...stop}>
      {children}
    </button>
  );
}
