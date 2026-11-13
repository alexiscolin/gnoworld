// A line Jarvis said among a room's lines: drawn as its card once the host's code has come (it is asked for here), the plain line till then.
import { useEffect, type ReactNode } from "react";
import { useJarvisSaidDrawing } from "../../jarvisHere.ts";
import { askFor } from "../../pageAsks.ts";

export function JarvisSaidSlot({ room, msgid, children }: { room: string; msgid: string; children: ReactNode }) {
  const draw = useJarvisSaidDrawing();
  useEffect(() => {
    if (draw === undefined) askFor("jarvis-said");
  }, [draw]);
  return draw === undefined ? children : draw(room, msgid, children);
}
