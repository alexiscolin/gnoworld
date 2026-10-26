// What Button, IconButton and the controls that wear a button's look share: the three sizes of a
// control, the icon each one draws, and the look itself.
import styles from "./Button.module.css";
import shared from "./control.module.css";

export type ControlSize = "s" | "m" | "l";

/** The icon a control of this size draws: 20 px in the large control only. */
export function iconSize(size: ControlSize) {
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
export function iconLook(emphasis: "outline" | "plain", size: ControlSize) {
  return {
    className: pill(styles["button"], styles["square"]),
    "data-emphasis": emphasis,
    "data-tone": "neutral",
    "data-size": size,
  };
}
