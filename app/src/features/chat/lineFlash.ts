// What the room's flash says of a line's copy and its delete (4c's message menu, docs/decisions.md 2026-10-26),
// moved out of Lines.tsx to keep each file and function in the lint's sizes.
import type { Line } from "@gnoworld/core";
import type { FlashMessage } from "@gnoworld/ui";
import { useState } from "react";
import { roomHref } from "./names.ts";

// What a copy says, in the room's flash: done, or not and why, a page with no clipboard (a plain http origin) included.
export function useCopy() {
  const [said, setSaid] = useState<FlashMessage | null>(null);
  const copy = (line: Line, what: "text" | "link", room: string) => {
    setSaid(null);
    const text = what === "text" ? line.text : new URL(roomHref(room), location.href).href;
    // A page with no clipboard throws at once: inside a then, it fails as a refusal does.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => {
          setSaid({ title: what === "text" ? "Text copied." : "Link copied." });
        },
        () => {
          setSaid({
            title: what === "text" ? "Could not copy the text." : "Could not copy the link.",
            line: "Your browser blocked the clipboard.",
          });
        },
      );
  };
  return { said, setSaid, copy };
}

interface RemovalProps {
  lines: readonly Line[];
  /** The msgid of a line Ergo refused to delete. */
  refused: string | undefined;
  /** Whether the chat is connected. */
  connected: boolean;
  onDelete: (id: string) => boolean;
  /** Hands the focus to a neighbour of the line `id`, which goes. */
  leave: (id: string) => void;
  setSaid: (said: FlashMessage | null) => void;
}

/** The id of a delete gone out and not answered yet, and the delete itself, which says whether it went out. */
export function useRemoval({ lines, refused, connected, onDelete, leave, setSaid }: RemovalProps) {
  // A delete gone out and not answered yet: its line offers no second one; Ergo's echo, taking the line, is said, and
  // its refusal ends it too (U4). ponytail: a line trimmed out of the window meanwhile reads as deleted, in the
  // milliseconds a REDACT waits for its echo.
  const [deleting, setDeleting] = useState<string>();
  if (deleting !== undefined && (refused === deleting || !lines.some((line) => line.id === deleting))) {
    setDeleting(undefined);
    if (refused !== deleting) setSaid({ title: "Message deleted." });
  } else if (deleting !== undefined && !connected) {
    // A link that dropped forgot the act waiting for its answer: no refusal will end it (CR1).
    setDeleting(undefined);
  }
  // A delete that went out hands the focus to a neighbour; one that could not says so and why, the line kept
  // (/code-review, U8): the chat out of reach, to try again once back, or a msgid no command carries.
  const remove = (id: string): boolean => {
    const went = onDelete(id);
    if (went) {
      setDeleting(id);
      leave(id);
    } else if (connected) setSaid({ title: "Could not delete the message.", line: "This message cannot be deleted." });
    else {
      setSaid({
        title: "Could not delete the message.",
        line: "The chat is out of reach.",
        action: {
          label: "Try again",
          onAction: () => {
            remove(id);
          },
        },
      });
    }
    return went;
  };
  return [deleting, remove] as const;
}
