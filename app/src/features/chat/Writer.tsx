// What writes under a room's lines (slice 4's 4c, moved out of ChatPanel.tsx): the composer for an account, loaded
// lazily, which writes through the link; a word for a guest.
import { lazy, Suspense } from "react";
import { pageDrafts } from "../../lib/drafts/page.ts";
import type { AppState } from "../../store/index.ts";
import type { ComposerProps } from "./Composer.tsx";
import { roomLabel } from "./names.ts";

// The composer, an account's alone: a visitor's page never loads its code (the first screen's budget, ADR-0001 §12).
const Composer = lazy(async () => ({ default: (await import("./Composer.tsx")).Composer }));

// Under a room's lines: the composer for an account, which writes through the link; a word for a guest.
// The word being typed completes to a room of the world's, by its label, or to another account in the room.
export interface WriterProps {
  session: AppState["login"]["session"];
  room: string;
  /** The name of whom it writes to, in place of the room's: a direct message's partner. */
  label?: string | undefined;
  rooms: readonly string[];
  members: readonly string[];
  onSay: (draft: string) => boolean;
  /** The lines Ergo refused, and why the last did not go: a direct message's (4e). */
  refused?: ComposerProps["refused"];
  /** Takes the focus as it starts (4e's U12). */
  focus?: boolean | undefined;
}

export function Writer({ session, room, label, rooms, members, onSay, refused, focus }: WriterProps) {
  if (session.kind !== "in") return <p>Log in to write in this room.</p>;
  // The account's drafts on this device: the room's, where the composer starts, and each change kept (4d).
  const kept = pageDrafts(session.address);
  return (
    <Suspense fallback={null}>
      <Composer
        draft={kept.get(room)}
        onDraft={(draft) => {
          kept.set(room, draft);
        }}
        key={room}
        room={room}
        label={label}
        nick={session.address}
        rooms={rooms.map(roomLabel)}
        members={members}
        onSay={onSay}
        refused={refused}
        focus={focus}
      />
    </Suspense>
  );
}
