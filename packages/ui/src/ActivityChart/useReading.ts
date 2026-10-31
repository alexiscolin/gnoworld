import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { keyboardFocus, useFirstEscape } from "../Tooltip/hold.ts";

// The bar under the pointer, and the one the keyboard rests on when the chart has the focus: each its own, so one
// leaving never hides the other's words (F334's class); Esc hides the words until either comes again (WCAG 1.4.13).
export function useReading(bars: number) {
  const last = bars - 1;
  const [pointerAt, setPointerAt] = useState<number | null>(null);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const under = pointerAt ?? focusAt;
  const shown = !dismissed && under !== null && under < bars ? under : null;
  const showing = shown !== null;
  // A shown tooltip takes the first Esc, before a dialog or popover around the chart.
  useFirstEscape(showing, true, () => {
    setDismissed(true);
  });
  const walk = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = focusAt ?? last;
    const to: Record<string, number> = {
      ArrowLeft: Math.max(0, from - 1),
      ArrowRight: Math.min(last, from + 1),
      Home: 0,
      End: last,
    };
    const next = to[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setFocusAt(next);
    setDismissed(false);
  };
  return {
    shown,
    focusAt: dismissed ? null : focusAt,
    group: {
      // Only the keyboard's focus holds the words: a click or a tap focuses the group too, and the hold would outlast the pointer (F2862).
      onFocus: (event: FocusEvent<HTMLDivElement>) => {
        if (!keyboardFocus(event)) return;
        setFocusAt(last);
        setDismissed(false);
      },
      onBlur: () => {
        setFocusAt(null);
      },
      onKeyDown: walk,
    },
    bar: (at: number) => ({
      onPointerEnter: () => {
        setPointerAt(at);
        setDismissed(false);
      },
      onPointerLeave: () => {
        setPointerAt(null);
      },
    }),
  };
}
