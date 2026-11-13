// How much room the chat header's own width leaves the place's buttons, so the header stays on one line (Alexis, 2026-11-12: "pas sur 2
// lignes"): PlaceActs.tsx gives what does not fit to its "More" menu.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useFull } from "./full.ts";
import type { ActsRoom } from "./PlaceActs.tsx";

// The narrowest the room's name is left before the buttons give way, where it ends in its ellipsis.
const MIN_NAME = 120;
// What the chevron after a name takes: its icon and the step before it (ChatHeader.module.css's `.trigger`).
const CHEVRON = 24;

const px = (value: string) => parseFloat(value) || 0;

// The room's name as long as it is drawn whole (a clipped text still lays out whole), and the chevron of the name that opens a menu.
function nameWidth(header: HTMLElement) {
  const name = header.querySelector("h2");
  if (name === null) return 0;
  const range = document.createRange();
  range.selectNodeContents(name.querySelector("span") ?? name);
  return range.getBoundingClientRect().width + (name.querySelector("svg") === null ? 0 : CHEVRON);
}

// What stands beside the controls in the header's row: the name's minimum and the mark in a dock's; in a phone's header, whose name has a
// row of its own, the rooms' control.
function beside(header: HTMLElement, { size, step, rooms }: { size: number; step: number; rooms: boolean }) {
  if (rooms) return size + step;
  const mark = header.querySelector<HTMLElement>("[data-mark]")?.offsetWidth ?? 0;
  return Math.min(MIN_NAME, nameWidth(header)) + step + (mark > 0 ? mark + step : 0);
}

function measure(header: HTMLElement, controls: HTMLElement, { own, rooms }: { own: number; rooms: boolean }) {
  const button = controls.querySelector("button");
  const style = getComputedStyle(header);
  const inner = header.clientWidth - px(style.paddingInlineStart) - px(style.paddingInlineEnd);
  if (button === null || button.offsetWidth === 0 || inner <= 0) return undefined;
  const size = button.offsetWidth;
  const gap = px(getComputedStyle(controls.firstElementChild ?? controls).columnGap);
  const room = inner - beside(header, { size, step: px(style.columnGap), rooms }) - own * (size + gap);
  return { room, size, gap } satisfies ActsRoom;
}

/** The header's controls box to put the ref on, and the room it leaves the buttons: none till measured and in the wide full chat, which has
 * room for all. `docked`, `buttons` and `rooms` say which fixed controls stand after them: the dock's arrows or the close, a rule between. */
export function useActsRoom({
  docked = false,
  buttons,
  rooms,
  wide,
  title,
  mark,
}: {
  docked?: boolean | undefined;
  buttons: boolean;
  rooms: boolean;
  wide: boolean;
  title: ReactNode;
  mark: ReactNode;
}) {
  const full = useFull();
  const controlsRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<ActsRoom>();
  // The name's and the mark's own words: another room, or a mark come, says the name's room again.
  const said = `${typeof title === "string" ? title : ""}|${mark === undefined ? "" : "mark"}`;
  const own = (docked ? (full ? 0 : 1) : 1) + (buttons && !docked ? 1 : 0);
  useLayoutEffect(() => {
    const header = controlsRef.current?.parentElement;
    if (wide || !controlsRef.current || !header) return;
    const read = () => {
      if (controlsRef.current) setFit(measure(header, controlsRef.current, { own, rooms }));
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(header);
    return () => {
      watch.disconnect();
    };
  }, [wide, own, rooms, said]);
  return { controlsRef, fit: wide ? undefined : fit };
}
