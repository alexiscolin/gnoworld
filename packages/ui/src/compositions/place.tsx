// What the compositions share: the space steps, the elements one may be, and how one is drawn.
import type { ReactNode } from "react";
import styles from "./compositions.module.css";

type Space = "3xs" | "2xs" | "xs" | "s" | "m" | "l" | "xl" | "2xl";
type Box = "div" | "section" | "header" | "footer" | "nav" | "ul" | "ol";

/** What every composition takes: its children, a space step (s unless asked) and its element. */
export interface Composed {
  children: ReactNode;
  space?: Space;
  as?: Box;
}

interface Placed extends Composed {
  className: string | undefined;
  // The composition's own choices, as the attributes its rules read.
  own?: Record<`data-${string}`, string>;
}

/** A composition's box: its element, its class and the shared one, its step and its choices. */
export function place({ children, space = "s", as: Element = "div", className, own }: Placed) {
  return (
    <Element className={[styles["space"], className].join(" ")} data-space={space} {...own}>
      {children}
    </Element>
  );
}
