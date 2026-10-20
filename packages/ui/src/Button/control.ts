// What Button and IconButton share: the three sizes of a control, and the icon each one draws.
export type ControlSize = "s" | "m" | "l";

/** The icon a control of this size draws: 20 px in the large control only. */
export function iconSize(size: ControlSize) {
  return size === "l" ? "l" : "m";
}
