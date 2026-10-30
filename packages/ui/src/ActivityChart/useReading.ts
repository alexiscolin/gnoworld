import { useEffect, useState, type KeyboardEvent } from "react";

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
  useEffect(() => {
    if (!showing) return;
    const stop = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setDismissed(true);
      },
      { capture: true, signal: stop.signal },
    );
    return () => {
      stop.abort();
    };
  }, [showing]);
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
      onFocus: () => {
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
