import { useEffect, useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { neighbour, roomParams } from "./names.ts";

// Alt+Up and Alt+Down: the room before or after the one in view, anywhere on the page (ADR-0002's chat rows). A key
// pressed before the page draws the room the last one went to starts from that room: the hook keeps it, and the room
// in view, once drawn or chosen otherwise, sets it again.
export function useRoomKeys(rooms: readonly string[], current: string | undefined) {
  const [, setParams] = useSearchParams();
  const fromRef = useRef(current);
  useLayoutEffect(() => {
    fromRef.current = current;
  }, [current]);
  useEffect(() => {
    const go = (event: globalThis.KeyboardEvent) => {
      const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
      const alone = event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey;
      const from = fromRef.current;
      const next = alone && step !== undefined && from !== undefined ? neighbour(rooms, from, step) : undefined;
      if (next === undefined) return;
      event.preventDefault();
      fromRef.current = next;
      setParams(roomParams(next));
    };
    window.addEventListener("keydown", go);
    return () => {
      window.removeEventListener("keydown", go);
    };
  }, [rooms, setParams]);
}
