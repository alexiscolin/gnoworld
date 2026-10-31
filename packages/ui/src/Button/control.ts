// What Button, IconButton and the controls that wear a button's look share: the three sizes of a
// control, the icon each one draws, and the look itself.
import styles from "./Button.module.css";
import shared from "./control.module.css";

export type ControlSize = "s" | "m" | "l";
/** An icon-only control may also be the smallest, 24 px: a format bar's, a toolbar's inside a box. */
export type IconControlSize = ControlSize | "xs";

/** The icon a control of this size draws: 20 px in the large control only. */
export function iconSize(size: IconControlSize) {
  return size === "l" ? "l" : "m";
}

/** The shared pill with a control's own classes. */
export function pill(...own: (string | undefined)[]) {
  return [shared["pill"], ...own].join(" ");
}

/** A button's look, as the attributes its module reads: what a popover's trigger wears too. */
export function buttonLook(emphasis: "solid" | "outline" | "quiet", tone: "neutral" | "danger", size: ControlSize) {
  return { className: pill(styles["button"]), "data-emphasis": emphasis, "data-tone": tone, "data-size": size };
}

/** An icon-only control's look, square, as the attributes its module reads: what IconButton and an icon trigger wear. */
export function iconLook(emphasis: "outline" | "plain", size: IconControlSize) {
  return {
    className: pill(styles["button"], styles["square"]),
    "data-emphasis": emphasis,
    "data-tone": "neutral",
    "data-size": size,
  };
}
