// What writes under a room's lines (slice 4's 4c, moved out of ChatPanel.tsx): the composer for an account, loaded
// lazily, which writes through the link; a word for a guest.
import { Suspense, type ReactNode } from "react";
import type { Line } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import { Composer } from "./composerChunk.ts";
import type { ComposerProps } from "./Composer.tsx";
import { LogInToWrite } from "./LogInToWrite.tsx";
import { roomLabel } from "./names.ts";
import { answeredOf } from "./Replying.tsx";
import { draftOf } from "./writerDraft.ts";

// Under a room's lines: the composer for an account, which writes through the link; a word for a guest.
// The word being typed completes to a room of the world's, by its label, or to another account in the room.
export interface WriterProps {
  session: AppState["login"]["session"];
  /** The room's quick actions, which the composer's + opens; none in a thread. */
  quick?: ReactNode;
  room: string;
  /** The name of whom it writes to, in place of the room's: a direct message's partner. */
  label?: string | undefined;
  rooms: readonly string[];
  members: readonly string[];
  /** Whether a mention of the whole room counts here (4f-n). */
  groups?: boolean | undefined;
  onSay: ComposerProps["onSay"];
  slow?: ComposerProps["slow"];
  /** What each change of the draft tells the room of the account's typing (4f); a direct message's tells none. */
  onTyping?: ((state: "active" | "done") => void) | undefined;
  /** The lines Ergo refused, and why the last did not go: a direct message's (4e). */
  refused?: ComposerProps["refused"];
  /** Takes the focus as it starts (4e's U12). */
  focus?: boolean | undefined;
  /** The id of what describes the conversation: a direct message's "not encrypted" (4e's U6). */
  describedBy?: string | undefined;
  /** The line the next one answers (4d's replies), how many times Reply was asked (each asking puts the focus in the
   * field), and how to answer none; a direct message has none. */
  replying?: Line | undefined;
  asked?: number | undefined;
  onCancelReply?: (() => void) | undefined;
  /** Whether the draft is kept on the device, by room; false for a thread's composer, whose lines are no room's draft:
   * its own `draft` and `onDraft` stand in, which the page keeps in memory. */
  keeps?: boolean | undefined;
  draft?: string | undefined;
  onDraft?: ((draft: string) => void) | undefined;
  /** Whether the connection sends a message of several lines whole (draft/multiline). */
  multiline?: boolean | undefined;
  /** The reader's own line being corrected, its words and how many times Edit was asked: the composer starts again from
   * them, the device's draft left as it was, and Save sends them (4d's DM bar). A correction Ergo refused, taken up
   * again (`back`), starts from the device's draft, which the refusal put back, and tells the refusal (CR2). */
  editing?: { text: string; asked: number; back?: true } | undefined;
  onCancelEdit?: (() => void) | undefined;
  /** The line being corrected went from the conversation: the box says so (CR3 of the room edit). */
  gone?: true | undefined;
}

export function Writer(props: WriterProps) {
  const { session, room, label, rooms, members, groups, onSay, slow, onTyping, refused, focus, describedBy } = props;
  const { replying, asked, onCancelReply, editing, onCancelEdit, gone, multiline } = props;
  if (session.kind !== "in") return <LogInToWrite />;
  return (
    <Suspense fallback={null}>
      <Composer
        {...draftOf(props, session.address)}
        room={room}
        label={label}
        nick={session.address}
        rooms={rooms.map(roomLabel)}
        members={members}
        groups={groups}
        onSay={onSay}
        slow={slow}
        onTyping={onTyping}
        refused={refused}
        focus={focus === true || editing !== undefined}
        describedBy={describedBy}
        replying={replying === undefined || editing !== undefined ? undefined : answeredOf(replying)}
        asked={asked}
        onCancelReply={onCancelReply}
        multiline={multiline}
        editing={editing !== undefined}
        onCancelEdit={onCancelEdit}
        gone={gone}
        quick={props.quick}
      />
    </Suspense>
  );
}
