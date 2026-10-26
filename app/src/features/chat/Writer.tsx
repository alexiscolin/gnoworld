// Under a room's lines (slice 4's 4c, out of ChatPanel.tsx): the composer for an account, which writes through the
// link, a word for a guest; the account's drafts kept on the device (4d).
import { lazy, Suspense } from "react";
import { pageDrafts } from "../../lib/drafts/page.ts";
import type { Line } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import { roomLabel } from "./names.ts";
import { answeredOf } from "./Replying.tsx";

// The composer, an account's alone: a visitor's page never loads its code (the first screen's budget, ADR-0001 §12).
const Composer = lazy(async () => ({ default: (await import("./Composer.tsx")).Composer }));

// The word being typed completes to a room of the world's, by its label, or to another account in the room.
interface WriterProps {
  session: AppState["login"]["session"];
  room: string;
  rooms: readonly string[];
  members: readonly string[];
  onSay: (draft: string) => boolean;
  /** The line the next one answers (4d's replies), and how to answer none. */
  replying: Line | undefined;
  /** How many times Reply was asked: each asking puts the focus in the field. */
  asked?: number | undefined;
  onCancelReply: () => void;
}

export function Writer({ session, room, rooms, members, onSay, replying, asked, onCancelReply }: WriterProps) {
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
        nick={session.address}
        rooms={rooms.map(roomLabel)}
        members={members}
        onSay={onSay}
        replying={replying === undefined ? undefined : { ...answeredOf(replying), asked }}
        onCancelReply={onCancelReply}
      />
    </Suspense>
  );
}
