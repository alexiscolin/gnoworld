import type { ReactNode } from "react";

type Span = 3 | 4 | 6 | 8 | 12;

export interface CellProps {
  /** How many of a twelve-column Grid's columns it takes. */
  span: Span;
  /** On a narrow plate (37.5 rem): 6 instead of the whole row. */
  narrow?: 6;
  children: ReactNode;
}

/** A child of Grid's twelve columns: its span, and the half row it may keep on a narrow plate. */
export function Cell({ span, narrow, children }: CellProps) {
  return (
    <div data-span={span} data-span-narrow={narrow}>
      {children}
    </div>
  );
}
