// A room (slice 4's 4b): its name, its description (its IRC topic), its newest lines as the store holds them
// (the window), held at the newest while the reader is there, who is here, and the state of the link. A line's
// text is Markdown (4c), built into elements from an allowlist (Message.tsx); one that mentions the reader says so
// (4d); the composer, given, goes below.
// A line's author is its account tag alone, a nick being only a nick; a member's nick is an account's when it is
// an address, which a guest's cannot be (Ergo gives a guest 32 characters, server/src/testing/ergo.test.ts:314).
import type { Line, Reacting, Reaction, Typing } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import { lazy, Suspense, type ReactNode } from "react";
import type { ErgoState } from "../../lib/ergo/ergo.ts";
import type { RoomKeeping, RoomPins } from "./RoomKeeping.ts";
import type { LinesProps } from "./Lines.tsx";
import styles from "./RoomView.module.css";
import { Typists } from "./Typists.tsx";

// The lines view (the lines, what is under them, a line's bar) is asked once the room holds a line: lines come over the
// WebSocket after the page is drawn, so its code is never the first screen's (ADR-0001 §12; docs/decisions.md,
// 2026-10-26). One boundary for every feature of a line.
const Lines = lazy(async () => ({ default: (await import("./Lines.tsx")).Lines }));
// The room's pins above its lines come from the server after the page is drawn, and show once there is one (4d).
const PinBar = lazy(async () => ({ default: (await import("./PinBar.tsx")).PinBar }));
const LINES = [styles["lines"], styles["fill"]].join(" ");
// The list's place while its code comes, or while the room holds no line: no line, no tab stop; a key pressed meanwhile
// acts on the page as it stands, nothing queued for the lines.
const waiting = (busy: boolean) => <ol aria-label="Messages" aria-busy={busy || undefined} className={LINES} />;

// The room's lines: the list's place while it holds none or their code comes, then the lines view.
function RoomLines(props: LinesProps) {
  return props.lines.length === 0 ? (
    waiting(false)
  ) : (
    <Suspense fallback={waiting(true)}>
      <Lines {...props} />
    </Suspense>
  );
}

// The room's pins above its lines, once it has one: their code is asked then, never on the first screen.
function PinsAbove({ pins }: { pins: RoomPins | undefined }) {
  return pins === undefined ? null : (
    <Suspense fallback={null}>
      <PinBar pins={pins.list} may={pins.may} onUnpin={pins.onUnpin} />
    </Suspense>
  );
}

const NOTICES: Record<Exclude<ErgoState | "off", "connected">, string> = {
  off: "Connecting to the chat…",
  connecting: "Connecting to the chat…",
  "logged-out": "Connecting to the chat…",
  waiting: "The chat is out of reach. Trying again…",
  stopped: "The chat is off.",
};

export interface RoomViewProps {
  /** The room whose lines are in view: its lines have bars (4c); none for a direct message's (4e). */
  room?: string | undefined;
  /** The partner of the direct message in view: its lines have bars too (4d's DM bar), with no link and no player. */
  partner?: string | undefined;
  /** What it says of itself above its lines: a room's description, its IRC topic; a conversation's "not encrypted". */
  note?: ReactNode;
  /** The note's id, which the composer points at (4e's U6). */
  noteId?: string | undefined;
  state:
    | {
        lines: readonly Line[];
        members: readonly string[];
        /** The msgid of a line Ergo refused to delete (4c). */
        refused?: string | undefined;
        /** Who is typing, each nick with the time its typing ends (4f). */
        typing?: Typing;
        /** The time of the last line the account read here, Ergo's (4f). */
        read?: string | undefined;
        /** This connection's history page came (4f's G1, CR3). */
        paged?: true | undefined;
        /** Its reactions (4d). */
        reactions?: readonly Reaction[] | undefined;
        /** Ergo refused one of the page's reactions here (4d). */
        cannotReact?: true | undefined;
      }
    | undefined;
  chat: ErgoState | "off";
  /** What goes under the lines: the composer for an account, a word for a guest. */
  composer?: ReactNode;
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me?: string | undefined;
  /** Deletes a line, the reader's own (4c's message menu); whether it went out. */
  onDelete: (id: string) => boolean;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss: () => void;
  /** The room read to its newest line, as the reader reaches it (4f). */
  onRead?: ((id: string) => void) | undefined;
  /** What it says while it holds no line, once connected: a conversation's own words (4e). */
  empty?: string | undefined;
  /** The room's lines' verdicts, by msgid, from the server's stream (4g). */
  verdicts?: Readonly<Record<string, StreamEvent["state"]>> | undefined;
  /** Whether the reader saves data (ADR-0002 §8): then no player is offered, nor any verdict asked (4g, F893). */
  saving?: boolean;
  /** What the reader keeps in this room and offers of it: none for a direct message's, which has none (4d). */
  keeping?: RoomKeeping | undefined;
  /** The room's pins, above its lines; none when it holds none (4d). */
  pins?: RoomPins | undefined;
  /** Reacts to a line, or takes the reaction back (4d's reactions); whether it went out. */
  onReact?: ((reaction: Reacting) => boolean) | undefined;
  /** Makes a line, by its msgid, the one the composer's next answers (4d's replies). */
  onReply?: ((id: string) => void) | undefined;
  /** The room's notification modes, under its name: an account's alone, which its code draws (4f-n). */
  modes?: ReactNode;
  /** Opens a line's thread, by the msgid of its root (4d's threads); none for a direct message's lines. */
  onThread?: ((id: string) => void) | undefined;
  /** Puts a line's words in the composer to correct them, the reader's own (a direct message's). */
  onEdit?: ((id: string) => void) | undefined;
}

// Above the lines: the room's description, its notification modes and the link's state, said in a status.
function Lead({
  note,
  noteId,
  modes,
  status,
}: {
  note: ReactNode;
  noteId: string | undefined;
  modes: ReactNode;
  status: ReactNode;
}) {
  return (
    <div className={styles["lead"]}>
      {note === undefined ? null : (
        <p id={noteId} className={styles["topic"]}>
          {note}
        </p>
      )}
      {modes}
      <p role="status" className={styles["status"]}>
        {status}
      </p>
    </div>
  );
}

/** What a page adds to the room in view (`Shown.view` gives the rest) before it gives its composer. */
export type RoomViewOver = Pick<RoomViewProps, "chat"> & Partial<Omit<RoomViewProps, "room" | "composer" | "chat">>;

export function RoomView(props: RoomViewProps) {
  const { room, note, noteId, state, chat, composer, me, onDelete, onDismiss, onRead } = props;
  const { onReact, onReply, modes, onThread, onEdit, partner } = props;
  const { verdicts, saving = false, keeping, pins } = props;
  const { empty = "No messages yet." } = props;
  const { lines = [], members = [], refused, typing, read, paged, reactions, cannotReact } = state ?? {};
  const connected = chat === "connected";
  return (
    <div className={styles["main"]}>
      <Lead note={note} noteId={noteId} modes={modes} status={connected ? null : NOTICES[chat]} />
      <PinsAbove key={`${String(room)} pins`} pins={pins} />
      <RoomLines
        key={room}
        room={room}
        partner={partner}
        lines={lines}
        members={members}
        me={me}
        refused={refused}
        connected={connected}
        onDelete={onDelete}
        onDismiss={onDismiss}
        read={read}
        paged={paged === true}
        onRead={onRead}
        verdicts={verdicts}
        saving={saving}
        keeping={keeping}
        reactions={reactions}
        onReact={onReact}
        cannotReact={cannotReact}
        onReply={onReply}
        onThread={onThread}
        onEdit={onEdit}
      />
      {connected && lines.length === 0 ? <p className={styles["lead"]}>{empty}</p> : null}
      {/* A room's, whose place is kept so the composer never moves; a direct message tells none (4e). */}
      {room === undefined ? null : <Typists key={`${room} typing`} typing={typing} />}
      {composer}
    </div>
  );
}
