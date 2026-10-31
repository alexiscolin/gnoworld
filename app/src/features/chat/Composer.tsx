// The composer (slice 4's 4c): Markdown to the room in view, sent with Enter or Send, Shift+Enter adding a line (a
// message of several lines goes as one, 4096 bytes and 40 lines at most: draft/multiline); its caller shows
// it to an account alone, a room letting accounts alone speak (+M). The design system's field holds the line and
// says what keeps it from going (too long for IRC's 510 bytes, a command it does not know, the chat away) or the
// bytes left near the end, or what Tab completes the word being typed to (a command, a room, an account). A format
// bar wraps the selection in Markdown's marks; the line shows below as it reads.
import { compose, type Composed } from "@gnoworld/core";
import { Field, Stack } from "@gnoworld/ui";
import { useRef, useState, type KeyboardEvent, type SubmitEvent } from "react";
import { completed } from "./complete.ts";
import { completionOf, useFocusAtStart, useHelp, useRefusal, useSelection, type Refused } from "./composerHooks.ts";
import { useEditing } from "./EditBar.tsx";
import { formatted, inserted, type Edit, type Format } from "./format.ts";
import { Message } from "./Message.tsx";
import { MessageBox } from "./MessageBox.tsx";
import { roomLabel } from "./names.ts";
import { useAnswering } from "./ReplyBar.tsx";
import type { Answered } from "./Replying.tsx";
import styles from "./Composer.module.css";

/** What an edit leaving `draft` tells the room of the account's typing (IRCv3's +typing), read as compose reads a
 * draft: text is active, an empty field done, a slash command nothing (the spec's), `//` text. */
export function typingOf(draft: string): "active" | "done" | undefined {
  const text = draft.replaceAll(/\p{Cc}/gu, " ").trim();
  if (text === "") return "done";
  return text.startsWith("/") && !text.startsWith("//") ? undefined : "active";
}

/** The draft as the room will read it, an action as one, the account's own mention apart, a member's shortened (F812),
 * out of reach of the keyboard and of a screen reader (the field says it already); nothing of a line that cannot go. */
export function Preview({
  composed,
  me,
  members,
}: {
  composed: Composed;
  me?: string | undefined;
  members?: ReadonlySet<string> | undefined;
}) {
  if (composed.kind !== "line" && composed.kind !== "lines") return null;
  return (
    <div className={styles["preview"]} inert>
      {composed.kind === "line" && composed.action ? "* " : null}
      <Message text={composed.text} me={me} members={members} />
    </div>
  );
}

export interface ComposerProps {
  room: string;
  /** The account's nick, which Ergo puts before each line it relays: the line's room is what it leaves. */
  nick: string;
  /** The world's rooms by label, and the room's members, whose other accounts a word after `@` completes to. */
  rooms: readonly string[];
  members: readonly string[];
  /** Whether a mention of the whole room counts in this room (4f-n); the field says so as `@room` stands in the draft. */
  groups?: boolean | undefined;
  /** Sends the draft as composed (and as written, which a refused direct message puts back); whether it went. */
  onSay: (composed: Composed, draft: string) => boolean;
  /** Why the draft is held back for the server's pace, asked as Send is pressed: none when it may go (F2092). */
  slow?: ((composed: Composed) => string | undefined) | undefined;
  /** Where the draft starts: the room's, kept on the device (4d). */
  draft?: string | undefined;
  /** Each change of the draft, for the device to keep; a line sent leaves it blank. */
  onDraft?: ((draft: string) => void) | undefined;
  /** What each change of the draft tells the room of the account's typing (4f). */
  onTyping?: ((state: "active" | "done") => void) | undefined;
  /** The name of whom it writes to, in place of the room's: a direct message's partner (4e). */
  label?: string | undefined;
  /** The lines Ergo refused so far, the last one's draft, and why it did not go (4e: a direct message to an account
   * not connected). One more while the composer is in view puts its draft back in the box. */
  refused?: Refused | undefined;
  /** Whether `refused` is a refusal not told yet as the composer starts: a correction Ergo refused, taken up again. */
  fresh?: boolean | undefined;
  /** Takes the focus as it starts: a direct message just opened from who is here, whose button went (4e's U12). */
  focus?: boolean | undefined;
  /** The id of what describes whom it writes to: a direct message's "not encrypted" (4e's U6). */
  describedBy?: string | undefined;
  /** The line the next one answers (4d's replies), said over the field; how many times Reply was asked, each asking
   * putting the focus in the field; and how to answer none. */
  replying?: Answered | undefined;
  asked?: number | undefined;
  onCancelReply?: (() => void) | undefined;
  /** Whether the connection sends a message of several lines whole; else a draft goes a line at a time, 20 at most (CR7). */
  multiline?: boolean | undefined;
  /** A message of the reader's is being corrected, its words the draft: Save sends the correction, which Escape or the
   * bar's Cancel drops (a direct message's, 4d). */
  editing?: boolean | undefined;
  onCancelEdit?: (() => void) | undefined;
  /** The line it was correcting went from the conversation: the field says so until the draft changes (CR3). */
  gone?: boolean | undefined;
}

// The draft, and each change of it: the device and the room told at once. A render alone (a line arriving, a room opened
// on a kept draft) writes nothing and tells no one (R3).
function useDraft({ draft: kept = "", onDraft, onTyping }: Pick<ComposerProps, "draft" | "onDraft" | "onTyping">) {
  const [draft, setDraft] = useState(kept);
  const change = (next: string) => {
    setDraft(next);
    onDraft?.(next);
    const told = typingOf(next);
    if (told !== undefined) onTyping?.(told);
  };
  return { draft, setDraft, change };
}

export function Composer(props: ComposerProps) {
  const { room, nick, rooms, members, onSay, label: to, refused } = props;
  const { draft, setDraft, change } = useDraft(props);
  const refusal = useRefusal(refused, draft, { setDraft, fresh: props.fresh, gone: props.gone });
  const [failed, setFailed] = useState<boolean | string>(false);
  const formRef = useRef<HTMLFormElement>(null);
  const label = to ?? roomLabel(room);
  const composed = compose(room, draft, nick);
  const completion = completionOf(draft, { rooms, members, nick, group: to === undefined });
  const { coarse, shown, goes } = useHelp(composed, props, { failed, completion, draft });
  // The selection an edit leaves is put back in the box once it shows the new draft.
  const { box, keep } = useSelection(formRef, draft);
  useFocusAtStart(formRef, props.focus);
  // An edit of the format bar or of a completion: the new draft, its selection, and no line not sent any more.
  const apply = (next: Edit) => {
    keep(next);
    change(next.text);
    setFailed(false);
    refusal.said();
  };
  const insert = (mark: string) => {
    const start = box()?.selectionStart ?? draft.length;
    apply(inserted({ text: draft, start, end: box()?.selectionEnd ?? start }, mark));
  };
  const format = (kind: Format) => {
    const start = box()?.selectionStart ?? draft.length;
    apply(formatted({ text: draft, start, end: box()?.selectionEnd ?? start }, kind));
  };
  // Tab in the box takes the first completion while the caret ends the draft; else, and anywhere else in the form,
  // it moves on, as it always does.
  const complete = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || event.shiftKey || completion === undefined) return;
    const input = box();
    if (event.target !== input || input.selectionStart !== draft.length) return;
    event.preventDefault();
    apply(completed(draft, completion));
  };
  const answering = useAnswering(props, { formRef, box, otherwise: complete });
  const editing = useEditing(props, box, answering);
  const send = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!goes) return;
    const slow = props.slow?.(composed);
    const went = slow === undefined && onSay(composed, draft);
    setFailed(slow ?? !went);
    refusal.said();
    if (went) change("");
  };
  return (
    <form
      ref={formRef}
      aria-label={`Write ${to === undefined ? "in" : "to"} ${label}`}
      aria-describedby={props.describedBy}
      onSubmit={send}
      onKeyDown={editing.keys}
    >
      <Stack space="2xs">
        {editing.bar}
        {/* The video's one rounded box: the format bar, the field, and at its foot the marks, the field's words and Send. */}
        <MessageBox onFormat={format} onInsert={insert} send={editing.send} goes={goes}>
          <Field
            kind="lines"
            enterAddsLine={coarse}
            label={`Message ${label}`}
            placeholder={`Message ${label}`}
            hideLabel
            resizable={false}
            describedBy={editing.describedBy}
            value={draft}
            onChange={(value) => {
              change(value);
              setFailed(false);
              refusal.said();
            }}
            {...(refusal.why === undefined ? shown : { error: refusal.why })}
          />
        </MessageBox>
        <Preview composed={composed} me={nick} members={new Set(members)} />
      </Stack>
    </form>
  );
}
