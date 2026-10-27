// What the composer is told of the line the next message answers (slice 4's 4d replies) or corrects (the DM bar's and the
// room's edits), moved out of Loaded.tsx for the lint's sizes: each its conversation's alone, dropped as another comes in view.
import { canEdit, foldEdits, type Line } from "@gnoworld/core";
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
  /** That the line being corrected went from the conversation (CR3). */
  gone: Here<true>;
  end: () => void;
  dropReply: () => void;
  /** The reader's address; none for a guest. */
  me: string | undefined;
}

// The line left the conversation (a bot's hide, a delete from another device): the edit ends, so its return does not reopen
// it, and the field says it (CR3).
function dropGone(edit: Here<Chosen>, gone: Here<true>, found: Line | undefined) {
  if (edit.value === undefined || found !== undefined) return;
  edit.clear();
  gone.update(() => true);
}

// What the writer is told of an edit that ended for its line's going.
const toldGone = (gone: Here<true>) => (gone.value === true ? { gone: true as const } : {});

// The line of the reader's own the conversation's next one corrects, its words put in the composer, as a reply's: one a
// conversation. Sent tagged with the line's msgid, shown in its place, unless unchanged. Asking for one drops a reply
// asked before (`dropReply`); an edit's end gives the box the focus.
function editsOf(
  shown: Shown | undefined,
  lines: readonly Line[] | undefined,
  { edit: here, ended, gone, end, dropReply, me }: Edits,
): Composing {
  const { value: edit, update } = here;
  const found = shownAs(edit, lines);
  dropGone(here, gone, found);
  // An orphan correction (its original left the window) is no line to correct: a new correction would name a line
  // nothing folds into (CR5).
  const editing = found?.edits === undefined ? found : undefined;
  if (shown === undefined) return { view: {}, writer: {} };
  const view = {
    // What the menu offers alone (canEdit): the bot hides a correction of another's line, a strike.
    onEdit: (id: string) => {
      const line = lines?.find((one) => one.id === id);
      if (line === undefined || !canEdit(line, me)) return;
      dropReply();
      gone.clear();
      update((was) => asking(was, id));
    },
  };
  if (edit === undefined || editing === undefined) {
    return { view, writer: { ...(ended.value === true ? { focus: true } : {}), ...toldGone(gone) } };
  }
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

// A line Ergo refused takes its reply or its correction up again as its conversation is in view or comes into view: its
// draft is back in the box (the store put it on the device), so the next Send answers or corrects as the first did. Not
// while a correction is open there: the draft waits on the device, a plain one (CR2); true then, for the refusal to say so.
function takeUp(tags: RefusedTags | undefined, { reply, edit }: { reply: Here<Chosen>; edit: Here<Chosen> }) {
  if (tags === undefined) return false;
  if (edit.value !== undefined) return true;
  const { edit: corrected, reply: answered } = tags;
  if (corrected !== undefined) {
    reply.clear();
    edit.update((was) => ({ ...asking(was, corrected), back: true }));
  } else if (answered !== undefined) {
    reply.update((was) => asking(was, answered));
  }
  return false;
}

// The refusal told as one whose draft stayed a plain one, a correction or a reply open there having kept its place; none
// for a refusal the draft of which went another way (`plain` counts the one left so).
function toldPlain(refused: Shown["writer"]["refused"], plain: number | undefined) {
  if (refused?.tags === undefined || plain !== refused.count) return undefined;
  const kind = refused.tags.edit === undefined ? "reply" : "correction";
  return { ...refused, why: `${refused.why} It will go as a new message, not as the ${kind} it was.` };
}

// Whether the refusals of the conversation `key` count `count` is news: each conversation's count is held as it is viewed,
// the ones the page held as it opened being old (nothing is news on the first view of the page), and any other, heard in
// view or while another conversation was (R7), new.
function useNews(key: string | undefined, count: number) {
  const [heard, setHeard] = useState<Readonly<Record<string, number>>>();
  if (key === undefined || heard?.[key] === count) return false;
  setHeard((was) => ({ ...was, [key]: count }));
  return heard !== undefined;
}

// What Ergo refused of the conversation's lines: a direct message's alone, whose lines go out labelled so its answers are
// known; a room's are heard by no one (F1920).
const refusedIn = (shown: Shown | undefined) => (shown?.kind === "dm" ? shown.writer.refused : undefined);

// A new refusal is taken up as its conversation is in view; what was left plain is told as the refusal's own.
function useRefusals(shown: Shown | undefined, held: { reply: Here<Chosen>; edit: Here<Chosen> }) {
  const plain = useHere<number>(shown?.key);
  const refused = refusedIn(shown);
  const count = refused?.count ?? 0;
  const news = useNews(shown?.key, count);
  if (news) {
    if (takeUp(refused?.tags, held)) plain.update(() => count);
  }
  return toldPlain(refused, plain.value);
}

/** The conversation in view and what its composer is told of the line it answers or corrects. */
export function useComposing(shown: Shown | undefined, me: string | undefined) {
  const lines = shown?.view.state?.lines;
  const reply = useHere<Chosen>(shown?.key);
  const edit = useHere<Chosen>(shown?.key);
  const ended = useHere<true>(shown?.key);
  const gone = useHere<true>(shown?.key);
  const refused = useRefusals(shown, { reply, edit });
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
  const edits = editsOf(shown, lines, { edit, ended, gone, end, dropReply: reply.clear, me });
  return {
    view: { ...replies.view, ...edits.view },
    writer: { ...replies.writer, ...edits.writer, ...(refused === undefined ? {} : { refused }) },
  };
}
