// What the room's flash says of a line's copy and its delete (4c's message menu, docs/decisions.md 2026-10-26),
// moved out of Lines.tsx to keep each file and function in the lint's sizes.
import type { Line } from "@gnoworld/core";
import type { FlashMessage } from "@gnoworld/ui";
import { useState } from "react";
import { copyText } from "../../lib/copy.ts";
import { LINES_KEPT } from "../../store/chat.ts";
import { roomHref } from "./names.ts";

// A line's action as a call with no argument, when the view gives one: made as the line's bar is, which only the line pointed at has.
export const forLine = (act: ((id: string) => void) | undefined, id: string) =>
  act === undefined
    ? undefined
    : () => {
        act(id);
      };
// What a copy says, in the room's flash: done, or not and why, a page with no clipboard (a plain http origin) included.
export function useCopy() {
  const [said, setSaid] = useState<FlashMessage | null>(null);
  const copy = (line: Line, what: "text" | "link", room: string) => {
    setSaid(null);
    const text = what === "text" ? line.text : new URL(roomHref(room) ?? "", location.href).href;
    copyText(text)
      .then((copied) => {
        setSaid(
          copied
            ? { title: what === "text" ? "Text copied." : "Link copied." }
            : {
                title: what === "text" ? "Could not copy the text." : "Could not copy the link.",
                line: "Your browser blocked the clipboard.",
              },
        );
      })
      .catch(reportError);
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
  /** The reader, and the room the lines are of: the reader's own message that leaves them is a hide (F2093). */
  me?: string | undefined;
  room?: string | undefined;
}

// Whether a message of `me` went from a room's lines, though no delete of its own took it: the bot's hide (a REDACT by
// another). A full window's oldest line going as another comes in is no hide; nor are the lines of another room.
function hidden(
  before: readonly Line[],
  after: readonly Line[],
  who: { me: string; deleting: string | undefined },
): boolean {
  const kept = new Set(after.map(({ id }) => id));
  const { me, deleting } = who;
  return before.some(
    (line, at) =>
      line.account === me &&
      !kept.has(line.id) &&
      (deleting === undefined || (line.id !== deleting && line.edits !== deleting)) &&
      (at > 0 || before.length < LINES_KEPT),
  );
}

// Says one's own message was hidden, when it leaves the lines of the room in view without a delete of one's own (F2093).
function useHidden(props: Pick<RemovalProps, "lines" | "room" | "me" | "setSaid"> & { deleting: string | undefined }) {
  const { lines, room, me, deleting, setSaid } = props;
  const [seen, setSeen] = useState({ room, lines });
  if (seen.lines === lines) return;
  setSeen({ room, lines });
  if (me !== undefined && room !== undefined && seen.room === room && hidden(seen.lines, lines, { me, deleting }))
    setSaid({ title: "Your message was hidden." });
}

/** The id of a delete gone out and not answered yet, and the delete itself, which says whether it went out. */
export function useRemoval({ lines, refused, connected, onDelete, leave, setSaid, me, room }: RemovalProps) {
  // A delete gone out and not answered yet: its line offers no second one; Ergo's echo, taking the line, is said, and
  // its refusal ends it too (U4). ponytail: a line trimmed out of the window meanwhile reads as deleted, in the
  // milliseconds a REDACT waits for its echo.
  const [deleting, setDeleting] = useState<string>();
  useHidden({ lines, room, me, deleting, setSaid });
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
