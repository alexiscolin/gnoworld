// What the composer is told of the line the next message answers (slice 4's 4d replies) or corrects (the DM bar's edits),
// moved out of Loaded.tsx for the lint's sizes: each its conversation's alone, dropped as another comes in view.
import { foldEdits, type Line } from "@gnoworld/core";
import { useState } from "react";
import type { Shown } from "./shown.tsx";
import type { RoomViewProps } from "./RoomView.tsx";
import type { WriterProps } from "./Writer.tsx";

// A line chosen to answer or to correct, in the conversation `key`, and how many times it was asked.
interface Chosen {
  key: string;
  id: string;
  asked: number;
}

// The line as the conversation shows it, while it holds it.
const shownAs = (chosen: Chosen | undefined, lines: readonly Line[] | undefined) =>
  foldEdits(lines ?? []).shown.find((line) => line.id === chosen?.id);

// Asked again, or for another line: the count goes up for the same conversation.
const asking = (was: Chosen | undefined, key: string, id: string): Chosen => ({
  key,
  id,
  asked: was?.key === key ? was.asked + 1 : 1,
});

interface Composing {
  view: Pick<RoomViewProps, "onReply" | "onEdit">;
  writer: Partial<WriterProps>;
}

// The line the next one answers (4d's replies), and how many times Reply was asked: each asking puts the focus in the
// field (G8). Its conversation's alone: another in view drops it, as does a line sent.
function useReplies(shown: Shown | undefined, lines: readonly Line[] | undefined): Composing {
  const [reply, setReply] = useState<Chosen>();
  const key = shown?.key;
  if (reply !== undefined && reply.key !== key) setReply(undefined);
  const current = reply?.key === key ? reply : undefined;
  const replying = shownAs(current, lines);
  if (shown === undefined) return { view: {}, writer: {} };
  return {
    view: {
      onReply: (id: string) => {
        setReply((was) => asking(was, shown.key, id));
      },
    },
    writer: {
      replying,
      asked: current?.asked,
      onCancelReply: () => {
        setReply(undefined);
      },
      onSay: (draft: string) => {
        const went = shown.say(draft, replying === undefined ? undefined : { reply: replying.id });
        if (went) setReply(undefined);
        return went;
      },
    },
  };
}

// The line of the reader's own a direct message's next one corrects, its words put in the composer: one a conversation, as
// a reply; none for a room. Sent as a correction tagged with the line's msgid, shown in its place.
function useEdits(shown: Shown | undefined, lines: readonly Line[] | undefined): Composing {
  const [edit, setEdit] = useState<Chosen>();
  const key = shown?.key;
  if (edit !== undefined && edit.key !== key) setEdit(undefined);
  const current = edit?.key === key ? edit : undefined;
  const editing = shownAs(current, lines);
  if (shown?.kind !== "dm") return { view: {}, writer: {} };
  if (current === undefined || editing === undefined) {
    return {
      view: {
        onEdit: (id: string) => {
          setEdit((was) => asking(was, shown.key, id));
        },
      },
      writer: {},
    };
  }
  return {
    view: {
      onEdit: (id: string) => {
        setEdit((was) => asking(was, shown.key, id));
      },
    },
    writer: {
      editing: { text: editing.text, asked: current.asked },
      onCancelEdit: () => {
        setEdit(undefined);
      },
      onSay: (draft: string) => {
        const went = shown.say(draft, { edit: editing.id });
        if (went) setEdit(undefined);
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
