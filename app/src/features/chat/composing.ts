// What the composer is told of the line the next message answers (slice 4's 4d replies) or corrects (the DM bar's edits),
// moved out of Loaded.tsx for the lint's sizes: each its conversation's alone, dropped as another comes in view.
import { foldEdits, type Line } from "@gnoworld/core";
import { useState } from "react";
import type { RefusedTags } from "../../store/dms.ts";
import type { Shown } from "./shown.tsx";
import type { RoomViewProps } from "./RoomView.tsx";
import type { WriterProps } from "./Writer.tsx";

// A line chosen to answer or to correct, how many times it was asked, and whether it is a correction Ergo refused, taken
// up again (`back`).
interface Chosen {
  id: string;
  asked: number;
  back?: true;
}

// The line as the conversation shows it, while it holds it: nothing is folded while none is chosen.
const shownAs = (chosen: Chosen | undefined, lines: readonly Line[] | undefined) =>
  chosen === undefined ? undefined : foldEdits(lines ?? []).shown.find((line) => line.id === chosen.id);

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

type Here<T> = ReturnType<typeof useHere<T>>;

// The line the next one answers (4d's replies), and how many times Reply was asked: each asking puts the focus in the
// field (G8). Its conversation's alone: another in view drops it, as does a line sent. Asking for one ends an edit
// (`endEdit`), as asking for an edit drops a reply (CR7).
function repliesOf(
  shown: Shown | undefined,
  lines: readonly Line[] | undefined,
  { reply: { value: reply, update, clear }, endEdit }: { reply: Here<Chosen>; endEdit: () => void },
): Composing {
  const replying = shownAs(reply, lines);
  if (shown === undefined) return { view: {}, writer: {} };
  return {
    view: {
      onReply: (id: string) => {
        endEdit();
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

// A line's words as the box holds them: compose sends one leading slash less than a line that starts with one is typed
// with, so the box shows the slash back, as a changed line needs it (CR6).
const boxed = (text: string) => (text.startsWith("/") ? `/${text}` : text);

// What the edits of a conversation hold: the line chosen, whether an edit ended in it, and how to end one.
interface Edits {
  edit: Here<Chosen>;
  ended: Here<true>;
  end: () => void;
  dropReply: () => void;
}

// The line of the reader's own a direct message's next one corrects, its words put in the composer, as a reply's: one a
// conversation, none for a room. Sent tagged with the line's msgid, shown in its place, unless unchanged. Asking for one
// drops a reply asked before (`dropReply`); an edit's end gives the box the focus.
function editsOf(
  shown: Shown | undefined,
  lines: readonly Line[] | undefined,
  { edit: here, ended, end, dropReply }: Edits,
): Composing {
  const { value: edit, update } = here;
  const found = shownAs(edit, lines);
  // An orphan correction (its original left the window) is no line to correct: a new correction would name a line
  // nothing folds into (CR5).
  const editing = found?.edits === undefined ? found : undefined;
  if (shown?.kind !== "dm") return { view: {}, writer: {} };
  const view = {
    onEdit: (id: string) => {
      dropReply();
      update((was) => asking(was, id));
    },
  };
  if (edit === undefined || editing === undefined) return { view, writer: ended.value === true ? { focus: true } : {} };
  const words = boxed(editing.text);
  return {
    view,
    writer: {
      editing: { text: words, asked: edit.asked, ...(edit.back === true ? { back: true as const } : {}) },
      onCancelEdit: end,
      onSay: (draft: string) => {
        const went = draft.trim() === words.trim() || shown.say(draft, { edit: editing.id });
        if (went) end();
        return went;
      },
    },
  };
}

// A line Ergo refused, heard while its conversation is in view, takes its reply or its correction up again: its draft is
// back in the box (the store put it on the device), so the next Send answers or corrects as the first did. Nothing is
// taken up while a correction is open: the draft waits on the device, a plain one (CR2).
function takeUp(tags: RefusedTags | undefined, { reply, edit }: { reply: Here<Chosen>; edit: Here<Chosen> }) {
  if (tags === undefined || edit.value !== undefined) return;
  const { edit: corrected, reply: answered } = tags;
  if (corrected !== undefined) {
    reply.clear();
    edit.update((was) => ({ ...asking(was, corrected), back: true }));
  } else if (answered !== undefined) {
    reply.update((was) => asking(was, answered));
  }
}

// The refusals the conversation held as it came in view are not new ones: each later one is taken up.
function useRefusals(shown: Shown | undefined, held: { reply: Here<Chosen>; edit: Here<Chosen> }) {
  const heard = useHere<number>(shown?.key);
  const refused = shown?.writer.refused;
  const count = refused?.count ?? 0;
  if (shown === undefined || heard.value === count) return;
  heard.update(() => count);
  if (heard.value !== undefined) takeUp(refused?.tags, held);
}

/** The conversation in view and what its composer is told of the line it answers or corrects. */
export function useComposing(shown: Shown | undefined) {
  const lines = shown?.view.state?.lines;
  const reply = useHere<Chosen>(shown?.key);
  const edit = useHere<Chosen>(shown?.key);
  const ended = useHere<true>(shown?.key);
  useRefusals(shown, { reply, edit });
  const end = () => {
    edit.clear();
    ended.update(() => true);
  };
  const replies = repliesOf(shown, lines, {
    reply,
    endEdit: () => {
      if (edit.value !== undefined) end();
    },
  });
  const edits = editsOf(shown, lines, { edit, ended, end, dropReply: reply.clear });
  return { view: { ...replies.view, ...edits.view }, writer: { ...replies.writer, ...edits.writer } };
}
