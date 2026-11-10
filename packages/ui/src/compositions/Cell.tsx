import type { ReactNode } from "react";

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 12;

export interface CellProps {
  /** How many of a twelve-column Grid's columns it takes. */
  span: Span;
  /** On a wide plate (62.5 rem): 5 or 7 instead. */
  wide?: 5 | 7;
  /** On a narrow plate (37.5 rem): 6 instead of the whole row. */
  narrow?: 6;
  children: ReactNode;
}

/** A child of Grid's twelve columns: its span, and the other two it takes as the plate is wide or narrow. */
export function Cell({ span, wide, narrow, children }: CellProps) {
  return (
    <div data-span={span} data-span-wide={wide} data-span-narrow={narrow}>
      {children}
    </div>
  );
}
