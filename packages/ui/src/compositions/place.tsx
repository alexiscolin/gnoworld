// What the compositions share: the space steps, the elements one may be, and how one is drawn.
import type { ReactNode } from "react";

export type Space = "3xs" | "2xs" | "xs" | "s" | "m" | "l" | "xl" | "2xl";
export type Box = "div" | "section" | "header" | "footer" | "nav" | "ul" | "ol";

interface Placed {
  as: Box;
  className: string | undefined;
  // The choices the module's rules read: the step, and each composition's own.
  attributes: Record<`data-${string}`, string>;
  children: ReactNode;
}

/** A composition's box: its element, its class and its choices, around its children. */
export function place({ as: Element, className, attributes, children }: Placed) {
  return (
    <Element className={className} {...attributes}>
      {children}
    </Element>
  );
}
