// Over the room read around a found message: where it is read, the way back to the latest, and the found message scrolled to and marked
// (slice 13, C). A late chunk with the search: a room never read so draws none of it.
import { Button, Sidebar } from "@gnoworld/ui";
import { useEffect, useState, type RefObject } from "react";
import { useApp, useAppStore } from "../../../storeContext.tsx";
import { jumpingOf } from "./jumping.ts";
import type { ChatLink } from "../linkTypes.ts";
import { readingWords } from "./jump.ts";
import styles from "./JumpBanner.module.css";

const FRAMES = 30;

// The found message's line, once the lines' chunk has drawn it: asked each frame for a short while, then given up.
function markFound(id: string): () => void {
  let frame = 0;
  let marked: Element | null = null;
  let tries = 0;
  const look = () => {
    marked = document.querySelector(`[data-chat-screen] ol[aria-label="Messages"] > li[data-line="${CSS.escape(id)}"]`);
    if (marked === null) {
      tries += 1;
      if (tries < FRAMES) frame = requestAnimationFrame(look);
      return;
    }
    marked.classList.add(styles["found"] ?? "");
    marked.scrollIntoView({ block: "center" });
  };
  look();
  return () => {
    cancelAnimationFrame(frame);
    marked?.classList.remove(styles["found"] ?? "");
  };
}

export default function JumpBanner({
  room,
  id,
  link,
}: {
  room: string;
  id: string;
  link: RefObject<ChatLink | undefined>;
}) {
  const time = useApp((app) => app.chat.rooms[room]?.lines.find((line) => line.id === id)?.time);
  const store = useAppStore();
  const [now] = useState(() => new Date());
  const ready = time !== undefined;
  useEffect(() => (ready ? markFound(id) : undefined), [id, ready]);
  return (
    <p role="status" className={["meta", styles["banner"]].join(" ")}>
      <Sidebar side="end" align="center" space="xs">
        <span>{readingWords(time ?? "", now)}</span>
        <Button
          emphasis="quiet"
          size="s"
          onClick={() => {
            if (link.current !== undefined) jumpingOf(store, link.current).latest(room);
          }}
        >
          Back to the latest ↓
        </Button>
      </Sidebar>
    </p>
  );
}
