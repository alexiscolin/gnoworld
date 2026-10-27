// What the composer is told of the line the next message answers (slice 4's 4d replies) or corrects (the DM bar's edits),
// moved out of Loaded.tsx for the lint's sizes: each its conversation's alone, dropped as another comes in view.
import { foldEdits, type Line } from "@gnoworld/core";
import { useState } from "react";
import type { Shown } from "./shown.tsx";
import type { RoomViewProps } from "./RoomView.tsx";
import type { WriterProps } from "./Writer.tsx";

// A line chosen to answer or to correct, and how many times it was asked.
interface Chosen {
  id: string;
  asked: number;
}

// The line as the conversation shows it, while it holds it.
const shownAs = (chosen: Chosen | undefined, lines: readonly Line[] | undefined) =>
  foldEdits(lines ?? []).shown.find((line) => line.id === chosen?.id);

// Asked again, or for another line: the count goes up.
const asking = (was: Chosen | undefined, id: string): Chosen => ({ id, asked: (was?.asked ?? 0) + 1 });

// What the conversation `key` alone holds: dropped as another comes in view.
function useHere<T>(key: string | undefined) {
  const [held, setHeld] = useState<{ key: string | undefined; value: T }>();
  if (held !== undefined && held.key !== key) setHeld(undefined);
  const value = held === undefined || held.key !== key ? undefined : held.value;
  return {
    value,
    update: (change: (was: T | undefined) => T) => {
      setHeld((was) => ({ key, value: change(was === undefined || was.key !== key ? undefined : was.value) }));
    },
    clear: () => {
      setHeld(undefined);
    },
  };
}

interface Composing {
  view: Pick<RoomViewProps, "onReply" | "onEdit">;
  writer: Partial<WriterProps>;
}

// The line the next one answers (4d's replies), and how many times Reply was asked: each asking puts the focus in the
// field (G8). Its conversation's alone: another in view drops it, as does a line sent.
function useReplies(shown: Shown | undefined, lines: readonly Line[] | undefined): Composing {
  const { value: reply, update, clear } = useHere<Chosen>(shown?.key);
  const replying = shownAs(reply, lines);
  if (shown === undefined) return { view: {}, writer: {} };
  return {
    view: {
      onReply: (id: string) => {
        update((was) => asking(was, id));
      },
    },
    writer: {
      replying,
      asked: reply?.asked,
      onCancelReply: clear,
      onSay: (draft: string) => {
        const went = shown.say(draft, replying === undefined ? undefined : { reply: replying.id });
        if (went) clear();
        return went;
      },
    },
  };
}

// The line of the reader's own a direct message's next one corrects, its words put in the composer: one a conversation, as
// a reply; none for a room. Sent as a correction tagged with the line's msgid, shown in its place.
function useEdits(shown: Shown | undefined, lines: readonly Line[] | undefined): Composing {
  const { value: edit, update, clear } = useHere<Chosen>(shown?.key);
  const editing = shownAs(edit, lines);
  if (shown?.kind !== "dm") return { view: {}, writer: {} };
  const view = {
    onEdit: (id: string) => {
      update((was) => asking(was, id));
    },
  };
  if (edit === undefined || editing === undefined) return { view, writer: {} };
  return {
    view,
    writer: {
      editing: { text: editing.text, asked: edit.asked },
      onCancelEdit: clear,
      onSay: (draft: string) => {
        const went = shown.say(draft, { edit: editing.id });
        if (went) clear();
        return went;
      },
    },
  };
}

/** The conversation in view and what its composer is told of the line it answers or corrects. */
export function useComposing(shown: Shown | undefined) {
  const lines = shown?.view.state?.lines;
  const replies = useReplies(shown, lines);
  const edits = useEdits(shown, lines);
  return { view: { ...replies.view, ...edits.view }, writer: { ...replies.writer, ...edits.writer } };
}
