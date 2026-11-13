// The composer (slice 4's 4c): Markdown to the room in view, sent with Enter or Send, Shift+Enter adding a line (a
// message of several lines goes as one, 4096 bytes and 40 lines at most: draft/multiline); its caller shows
// it to an account alone, a room letting accounts alone speak (+M). The design system's field holds the line and
// says what keeps it from going (too long for IRC's 510 bytes, a command it does not know, the chat away) or the
// bytes left near the end, or what Tab completes the word being typed to (a command, a room, an account). A format
// bar wraps the selection in Markdown's marks.
import { compose, type Composed } from "@gnoworld/core";
import { composeDraft, DRAFT_COMMANDS } from "./polling.ts";
import { cardAsked, CARD_COMMANDS } from "./cardCommands.ts";
import { Stack } from "@gnoworld/ui";
import { useRef, useState, type ReactNode, type SubmitEvent } from "react";
import { FIELD } from "./composerBox.ts";
import { useFocusAtStart, useHelp, useRefusal, type Refused } from "./composerHooks.ts";
import { LinkTool } from "./composer/LinkTool.tsx";
import { ComposerField, THEME } from "./composer/ComposerField.tsx";
import { createComposerEditor } from "./composer/markdownEditor.ts";
import { suggestions } from "./composer/suggest.ts";
import { useEditing } from "./EditBar.tsx";
import { useJarvis } from "./JarvisButton.tsx";
import { MessageBox } from "./MessageBox.tsx";
import { NameNudge } from "./NameNudge.tsx";
import { actsOf } from "./composer/acts.ts";
import { useMemberNames } from "../names/index.ts";
import { peopleOf, roomLabel } from "./names.ts";
import { useAnswering } from "./ReplyBar.tsx";
import type { Answered } from "./Replying.tsx";

/** What an edit leaving `draft` tells the room of the account's typing (IRCv3's +typing), read as compose reads a
 * draft: text is active, an empty field done, a slash command nothing (the spec's), `//` text. */
export function typingOf(draft: string): "active" | "done" | undefined {
  const text = draft.replaceAll(/\p{Cc}/gu, " ").trim();
  if (text === "") return "done";
  return text.startsWith("/") && !text.startsWith("//") ? undefined : "active";
}

export interface ComposerProps {
  room: string;
  /** The room's quick actions, which the box's + opens (QuickActions.tsx); none in a thread. */
  quick?: ReactNode;
  /** The account's nick, which Ergo puts before each line it relays: the line's room is what it leaves. */
  nick: string;
  /** The world's rooms by label, and the room's members, whose other accounts a word after `@` completes to. */
  rooms: readonly string[];
  members: readonly string[];
  /** The members' gno.land names by address, for those who have one, in place of the chains' (a test's): `@` suggests them by name. */
  names?: ReadonlyMap<string, string> | undefined;
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

// What a card command composes: its line, or nothing when it was asked wrong (the field says why).
const composedCard = (room: string, nick: string, card: NonNullable<ReturnType<typeof cardAsked>>): Composed =>
  card.ok ? compose(room, card.text, nick) : { kind: "empty" };

// What a word being typed may become: a direct message has no card commands, no @room and no Jarvis.
const choicesOf = (
  inRoom: boolean,
  jarvis: { answers: boolean; examples: readonly string[] | undefined },
  { rooms, people }: { rooms: readonly string[]; people: readonly string[] },
) => ({
  rooms,
  people,
  commands: inRoom ? [...DRAFT_COMMANDS, ...CARD_COMMANDS] : DRAFT_COMMANDS,
  group: inRoom,
  jarvis: jarvis.answers && inRoom,
  examples: inRoom ? jarvis.examples : undefined,
});

export function Composer(props: ComposerProps) {
  const { room, nick, rooms, members, onSay, label: to, refused } = props;
  const { draft, setDraft, change } = useDraft(props);
  const refusal = useRefusal(refused, draft, { setDraft, fresh: props.fresh, gone: props.gone });
  const [failed, setFailed] = useState<boolean | string>(false);
  const [editor] = useState(() => createComposerEditor(draft, THEME));
  const formRef = useRef<HTMLFormElement>(null);
  const label = to ?? roomLabel(room);
  // A card command sends its card's line (a direct message has no room for it, so it is an unknown command there).
  const card = to === undefined ? cardAsked(draft) : undefined;
  const composed: Composed = card === undefined ? composeDraft(room, draft, nick) : composedCard(room, nick, card);
  const people = peopleOf(members, nick);
  const read = useMemberNames(people, props.names === undefined && /(^|\s)@\S*$/u.test(draft));
  const names = props.names ?? read;
  const jarvis = useJarvis(props.quick);
  const choices = choicesOf(to === undefined, jarvis, { rooms, people });
  const listed = suggestions(draft, { ...choices, names });
  // A command still being typed, its suggestions on screen, is not yet an unknown one.
  const { coarse, shown, goes } = useHelp(composed, props, { failed, draft, card, completing: listed.length > 0 });
  useFocusAtStart(formRef, props.focus);
  const box = () => formRef.current?.querySelector(FIELD) ?? undefined;
  // What the field does leaves no line not sent: the failure said for the last one goes as the draft changes.
  const edited = () => {
    setFailed(false);
    refusal.said();
  };
  const { format, link, take, mention } = actsOf(editor, draft, edited);
  const answering = useAnswering(props, { formRef, box });
  const editing = useEditing(props, box, answering);
  const send = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!goes) return;
    const slow = props.slow?.(composed);
    const went = slow === undefined && onSay(composed, draft);
    setFailed(slow ?? !went);
    refusal.said();
    if (!went) return;
    // A line to Jarvis goes to the room as any line, so the room sees the question, and is asked of Jarvis once it went: the answer is
    // the asker's card.
    jarvis.asked(draft);
    change("");
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
        <MessageBox
          onFormat={format}
          linkTool={(size) => <LinkTool onApply={link} size={size} />}
          send={editing.send}
          goes={goes}
          quick={jarvis.quickWith(mention)}
        >
          <ComposerField
            editor={editor}
            value={draft}
            enterAddsLine={coarse}
            label={`Message ${label}`}
            placeholder={`Message ${label}`}
            describedBy={editing.describedBy}
            names={names}
            suggestions={listed}
            onTake={take}
            onChange={(value) => {
              change(value);
              edited();
            }}
            {...(refusal.why === undefined ? shown : { error: refusal.why })}
          />
        </MessageBox>
        <NameNudge />
      </Stack>
    </form>
  );
}
