// A phone's sheet (the place's page, with its info at the foot) in the address, a search parameter the router owns: opening it adds one
// history entry, so the browser's Back closes it; a reload or a link that holds it opens the sheet.
// Never a hash (the plates use them for their own sections) and never in a shared link (share/link.ts drops the query).
import type { PointerEvent } from "react";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { SHEET, type Sheet } from "./placePage.ts";

const DEPTH = { page: 1 } as const;

/** The sheet the search names; none for any other value. */
export function sheetOf(params: URLSearchParams): Sheet | undefined {
  const asked = params.get(SHEET);
  return asked === "page" ? asked : undefined;
}

// The entries to go back over, when they are this code's own: a close from the page straight to none goes back over the whole run, so
// the next Back leaves the place, not reopens Info; one step up goes back one. None: replace the address.
function backBy(target: number, here: { depth: number; ours: boolean; run: number | undefined }): number | undefined {
  const { depth, ours, run } = here;
  if (target === 0 && run !== undefined) return run;
  return ours && target === depth - 1 ? 1 : undefined;
}

/** The open sheet and the way to another (none closes). Going deeper pushes an entry that says so (its state); going one up pops it when
 * it is this code's own (a close from the page to none pops the whole run), else (a reload, a link) replaces the address, so the entry before stays the page's. */
export function useSheet(): { sheet: Sheet | undefined; move: (to: Sheet | undefined) => void } {
  const { pathname, search, hash, ...at } = useLocation();
  const state: unknown = at.state;
  const navigate = useNavigate();
  const sheet = sheetOf(new URLSearchParams(search));
  const depth = sheet === undefined ? 0 : DEPTH[sheet];
  const ours = typeof state === "object" && state !== null && "sheet" in state && state.sheet === depth;
  // How many entries this run of sheets pushed since the page (none when it began at an address that held a sheet already).
  const run = ours && "run" in state && typeof state.run === "number" ? state.run : undefined;
  return {
    sheet,
    move: (to) => {
      const target = to === undefined ? 0 : DEPTH[to];
      const params = new URLSearchParams(search);
      if (to === undefined) params.delete(SHEET);
      else params.set(SHEET, to);
      const query = params.toString();
      const next = { pathname, search: query === "" ? "" : `?${query}`, hash };
      const pushed = depth === 0 ? 1 : run === undefined ? undefined : run + 1;
      const back = target < depth ? backBy(target, { depth, ours, run }) : undefined;
      const done =
        target > depth
          ? navigate(next, { state: { sheet: target, run: pushed } })
          : back === undefined
            ? navigate(next, { replace: true })
            : navigate(-back);
      Promise.resolve(done).catch(reportError);
    },
  };
}

// A swipe down on the sheet's title row: a drag of this many pixels at least, more down than across, closes it.
const SWIPE_DISTANCE = 64;

/** Whether a drag of (dx, dy) pixels is a swipe down that closes the sheet. */
export const swipedDown = (dx: number, dy: number): boolean => dy >= SWIPE_DISTANCE && dy > Math.abs(dx);

/** Pointer handlers closing the sheet by a swipe down that begins on its title row (what is not the sheet's content, `[data-sheet]`). */
export function useSwipeClose(onClose: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const inside = event.target instanceof Element && event.target.closest("dialog") !== null;
      const title = event.target instanceof Element && event.target.closest("[data-sheet]") === null;
      startRef.current = inside && title ? { x: event.clientX, y: event.clientY } : null;
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const start = startRef.current;
      startRef.current = null;
      if (start !== null && swipedDown(event.clientX - start.x, event.clientY - start.y)) onClose();
    },
    onPointerCancel: () => {
      startRef.current = null;
    },
  };
}
