// What writes under a room's lines (slice 4's 4c, moved out of ChatPanel.tsx): the composer for an account, loaded
// lazily, which writes through the link; a word for a guest.
import { lazy, Suspense } from "react";
import type { Line } from "@gnoworld/core";
import { pageDrafts } from "../../lib/drafts/page.ts";
import type { AppState } from "../../store/index.ts";
import type { ComposerProps } from "./Composer.tsx";
import { LOG_IN_TO_WRITE } from "./loginWords.ts";
import { roomLabel } from "./names.ts";
import { answeredOf } from "./Replying.tsx";

// The composer, an account's alone: a visitor's page never loads its code (the first screen's budget, ADR-0001 §12).
const load = async () => ({ default: (await import("./Composer.tsx")).Composer });
let Composer = lazy(load);

/** A lazy component keeps its failure for good: the page that caught a chunk that could not be fetched makes it anew. */
export function renewComposer() {
  Composer = lazy(load);
}

// Under a room's lines: the composer for an account, which writes through the link; a word for a guest.
// The word being typed completes to a room of the world's, by its label, or to another account in the room.
export interface WriterProps {
  session: AppState["login"]["session"];
  room: string;
  /** The name of whom it writes to, in place of the room's: a direct message's partner. */
  label?: string | undefined;
  rooms: readonly string[];
  members: readonly string[];
  /** Whether a mention of the whole room counts here (4f-n). */
  groups?: boolean | undefined;
  onSay: (draft: string) => boolean;
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
}

export function Writer(props: WriterProps) {
  const { session, room, label, rooms, members, groups, onSay, onTyping, refused, focus, describedBy } = props;
  const { replying, asked, onCancelReply, keeps = true, draft, onDraft } = props;
  if (session.kind !== "in") return <p>{LOG_IN_TO_WRITE}</p>;
  // The account's drafts on this device: the room's, where the composer starts, and each change kept (4d).
  const kept = pageDrafts(session.address);
  return (
    <Suspense fallback={null}>
      <Composer
        draft={keeps ? kept.get(room) : draft}
        onDraft={
          keeps
            ? (text) => {
                kept.set(room, text);
              }
            : onDraft
        }
        key={room}
        room={room}
        label={label}
        nick={session.address}
        rooms={rooms.map(roomLabel)}
        members={members}
        groups={groups}
        onSay={onSay}
        onTyping={onTyping}
        refused={refused}
        focus={focus}
        describedBy={describedBy}
        replying={replying === undefined ? undefined : answeredOf(replying)}
        asked={asked}
        onCancelReply={onCancelReply}
      />
    </Suspense>
  );
}
