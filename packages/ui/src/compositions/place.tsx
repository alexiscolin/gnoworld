// What the compositions share: the space steps, the elements one may be, and how one is drawn.
import type { AriaAttributes, ReactNode } from "react";
import styles from "./compositions.module.css";

type Space = "3xs" | "2xs" | "xs" | "s" | "m" | "l" | "xl" | "2xl" | "zone";
type Box = "div" | "section" | "header" | "footer" | "nav" | "ul" | "ol" | "dl" | "li" | "button";

/** What every composition takes: its children, a space step (s unless asked), its element, and a block's own class, an id and ARIA,
 * so a block that must name, label or style its box keeps the composition's layout. */
export interface Composed extends AriaAttributes {
  children: ReactNode;
  space?: Space;
  as?: Box;
  className?: string | undefined;
  id?: string | undefined;
}

interface Placed extends Composed {
  composition: string | undefined;
  // The composition's own choices, as the attributes its rules read.
  own?: Record<`data-${string}`, string>;
  ref?: (element: HTMLElement | null) => void;
}

/** A composition's box: its element (a button submits nothing), its class and the shared one, a block's own, its step and its choices. */
export function place({
  children,
  space = "s",
  as: Element = "div",
  composition,
  className,
  own,
  ref,
  ...attributes
}: Placed) {
  const box = {
    ref,
    className: [styles["space"], composition, ...(className === undefined ? [] : [className])].join(" "),
    "data-space": space,
    ...attributes,
    ...own,
  };
  return Element === "button" ? (
    <button type="button" {...box}>
      {children}
    </button>
  ) : (
    <Element {...box}>{children}</Element>
  );
}
