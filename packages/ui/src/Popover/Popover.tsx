import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type ToggleEvent,
} from "react";
import { buttonLook, iconLook, iconSize, type IconControlSize } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Chip } from "../Chip/Chip.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { rove } from "../roving.ts";
import { useAtPoint } from "./atPoint.ts";
import { floating, usePlaced } from "./floating.ts";
import { Trigger } from "./Trigger.tsx";
import styles from "./Popover.module.css";

// What a popover and a menu share: a trigger and the native popover it opens (light dismiss and Esc
// are the browser's), unseen until placed, as its toggle event comes after it shows; the focus back
// on the trigger when it closes with the focus inside, which a browser that never focused it drops.
function useAnchored(kind: "dialog" | "menu", size: "s" | "m" = "m", emphasis: "outline" | "quiet" = "outline") {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const insideRef = useRef(false);
  usePlaced(triggerRef, panelRef, { open, side: "below", align: "start" });
  const trigger = {
    ref: triggerRef,
    ...buttonLook(emphasis, "neutral", size),
    popoverTarget: id,
    "aria-haspopup": kind,
  };
  const panel = {
    ref: panelRef,
    id,
    popover: "auto" as const,
    role: kind,
    className: floating(styles["panel"]),
    "data-kind": kind,
    onBeforeToggle: (event: ToggleEvent<HTMLDivElement>) => {
      if (event.newState === "open") event.currentTarget.style.visibility = "hidden";
      else insideRef.current = event.currentTarget.contains(document.activeElement);
    },
    onToggle: (event: ToggleEvent<HTMLDivElement>) => {
      setOpen(event.newState === "open");
      if (event.newState === "open") return;
      const now = document.activeElement;
      if (insideRef.current && (now === null || now === document.body || event.currentTarget.contains(now)))
        triggerRef.current?.focus();
    },
  };
  return { open, panelRef, trigger, panel };
}

export interface PopoverProps {
  /** The trigger's words, or what it shows; none with an `icon`. */
  trigger: ReactNode;
  /** A trigger with no button's look: the words it holds as they are (a name in a line, which opens a person's card). */
  plain?: boolean;
  /** An icon-only trigger as an IconButton's plain one (named by `label`), at this size, in place of the words. */
  icon?: { name: IconName; size: IconControlSize };
  /** Its panel drawn only while open: a popover of each of many rows (a person's card on each line) costs nothing closed. */
  lazy?: boolean;
  /** Whether the trigger is a Tab stop: a list that is one stop (a room's lines) leaves its rows' controls out until in focus. */
  tabbable?: boolean;
  /** The wider panel (440 px), for a card of lists: it still stays inside the screen and scrolls inside itself. */
  wide?: boolean;
  /** What the panel is, for assistive technology. */
  label: string;
  children: ReactNode;
}

/** A panel under its trigger, closed by a click outside or Esc. */
export function Popover({
  trigger: words,
  plain = false,
  icon,
  lazy = false,
  tabbable = true,
  wide = false,
  label,
  children,
}: PopoverProps) {
  const { open, trigger, panel } = useAnchored("dialog");
  return (
    <>
      <Trigger {...{ plain, icon, tabbable, label, attrs: trigger }}>{words}</Trigger>
      <div {...panel} aria-label={label} data-wide={wide ? "" : undefined}>
        {lazy && !open ? null : children}
      </div>
    </>
  );
}

interface Entry {
  label: string;
  /** The act's icon before its words. */
  icon?: IconName;
}

/** An act of the menu; or one a later slice brings, greyed and inert, said to be coming soon as ComingSoon says it (`soon`). */
export type MenuItem =
  | (Entry & {
      onSelect: () => void;
      /** An irreversible act: coral, with the alert icon, after a separator (docs/DESIGN-SYSTEM.md, "Severity"). */
      tone?: "danger";
    })
  | (Entry & {
      soon: true;
      /** Why it is greyed, where "coming soon" is not the reason: said in its name and in the place of the Soon chip. */
      why?: string;
    });

export interface MenuProps {
  /** The trigger's words; with an icon, its name, which assistive technology reads and its tooltip shows. */
  trigger: string;
  label: string;
  items: MenuItem[];
  /** An icon in place of the words: the trigger is then square, as an IconButton. */
  icon?: IconName;
  /** The trigger's look: outline unless plain, an icon's as an IconButton's, words' as a quiet button's (a row of plain tags'). */
  emphasis?: "outline" | "plain";
  /** A trigger's size (a words trigger's too): small in a toolbar (docs/DESIGN-SYSTEM.md, "a toolbar's small controls stay at 32"), the smallest, 24 px, in a bar over a line. */
  size?: "xs" | "s" | "m";
  /** Drawn before the words of a trigger with words: the account's face; with it, the words may be for assistive technology alone. */
  lead?: ReactNode;
  /** The words of a trigger with a lead, read and not drawn. */
  wordsHidden?: boolean;
  /** Open as it is drawn: a menu whose code came at its trigger's first press, drawn in its place. */
  openAtOnce?: boolean;
  /** Open now at this point of the screen, as a right-click's menu does: each new object asks once. */
  at?: { x: number; y: number } | undefined;
}

/** A list of acts under its trigger, its first item focused as it opens; the arrows move among the
 * items, round the ends, Home and End go to the ends, and an act closes it first (WAI-ARIA's menu). */
export function Menu({
  trigger: words,
  label,
  items,
  icon,
  emphasis = "outline",
  size = "m",
  lead,
  wordsHidden = false,
  openAtOnce = false,
  at,
}: MenuProps) {
  // A plain trigger with words is a quiet button's; an icon's look is IconButton's, which overrides it.
  const look = emphasis === "plain" ? "quiet" : "outline";
  const { open, panelRef, trigger, panel } = useAnchored("menu", size === "xs" ? "s" : size, look);
  useAtPoint(panelRef, open, at);
  useLayoutEffect(() => {
    if (openAtOnce) panelRef.current?.showPopover();
  }, [openAtOnce, panelRef, trigger.ref]);
  // The danger acts come last, apart: a separator before the first.
  const apart = items.findIndex((item) => "onSelect" in item && item.tone === "danger");
  // Its first item, once placed and so seen: a hidden item takes no focus.
  useLayoutEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [open, panelRef]);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.currentTarget.hidePopover();
      return;
    }
    rove(event, "[role='menuitem']", ["ArrowUp", "ArrowDown"]);
  };
  return (
    <>
      {icon === undefined ? (
        <button type="button" {...trigger}>
          {lead}
          {wordsHidden ? <span className="visually-hidden">{words}</span> : words}
        </button>
      ) : (
        <Tooltip label={words}>
          <button type="button" {...trigger} aria-label={words} {...iconLook(emphasis, size)}>
            <Icon name={icon} size={iconSize(size)} />
          </button>
        </Tooltip>
      )}
      <div {...panel} aria-label={label} onKeyDown={move}>
        {items.map((item, at) => (
          <Fragment key={item.label}>
            {at === apart ? <div role="separator" className={styles["separator"]} /> : null}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={["tint", "full-start", styles["item"]].join(" ")}
              {...("soon" in item
                ? { "aria-disabled": true, "aria-label": `${item.label}, ${item.why ?? "coming soon"}` }
                : {
                    "data-tone": item.tone,
                    onClick: () => {
                      panelRef.current?.hidePopover();
                      // The trigger holds the focus as the item acts, which a browser that never focused it does not give back
                      // on hiding: a dialog the item opens returns the focus there as it closes, never to the page.
                      trigger.ref.current?.focus();
                      item.onSelect();
                    },
                  })}
            >
              {"onSelect" in item && item.tone === "danger" ? <Icon name="alert" /> : null}
              {item.icon === undefined ? null : <Icon name={item.icon} />}
              {item.label}
              {"soon" in item ? (
                <span className={styles["soon"]}>
                  <Chip>{item.why ?? "Soon"}</Chip>
                </span>
              ) : null}
            </button>
          </Fragment>
        ))}
      </div>
    </>
  );
}
