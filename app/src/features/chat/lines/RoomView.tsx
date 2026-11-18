// A room: its newest lines as the store holds them
// (the window), held at the newest while the reader is there, who is here, and the state of the link. A line's
// text is Markdown, built into elements from an allowlist (Message.tsx); one that mentions the reader says so;
// the composer, given, goes below.
// A line's author is its account tag alone, a nick being only a nick; a member's nick is an account's when it is
// an address, which a guest's cannot be (Ergo gives a guest 32 characters, server/src/testing/ergo.test.ts:314).
import { PHONE_QUERY, type Line, type Reacting, type Reaction, type Typing } from "@gnoworld/core";
import { EmptyState } from "@gnoworld/ui";
import type { StreamEvent } from "@gnoworld/schemas";
import { lazy, Suspense, use, type ReactNode } from "react";
import type { ErgoState } from "../../../lib/ergo/ergo.ts";
import type { RoomKeeping, RoomPins } from "../rooms/RoomKeeping.ts";
import { ChainCallsContext, ChainPlaceContext } from "./chainThread.ts";
import { useJarvisItems } from "../../../jarvisHere.ts";
import type { LinesProps } from "./Lines.tsx";
import styles from "./RoomView.module.css";
import { chunked } from "../Failing.tsx";
import { NO_ROOM_YET } from "../loginWords.ts";
import { SkeletonLines } from "../dock/SkeletonBits.tsx";
import { useMedia } from "../dock/useMedia.ts";

// The lines view (the lines, what is under them, a line's bar) is asked once the room holds a line: lines come over the
// WebSocket after the page is drawn, so its code is never the first screen's (ADR-0001 §12). One boundary for every feature of a line.
const Lines = lazy(async () => ({ default: (await import("./Lines.tsx")).Lines }));
// The room's pins above its lines come from the server after the page is drawn, and show once there is one.
const PinBar = lazy(async () => ({ default: (await import("../rooms/PinBar.tsx")).PinBar }));
// Who is typing is asked once someone is: a room where nobody types draws only its one empty line, kept so the composer never
// moves, and the first screen does not carry the names' code (ADR-0001 §12).
const NOBODY = <p className={["meta", styles["typing"]].join(" ")} />;

/** What a chat says in its room's place when the place has no room yet, a visitor's and an account's alike. */
export const NoRoomYet = ({ failed }: { failed?: ReactNode }) => (
  <div role={failed === undefined ? "status" : undefined} className={styles["lead"]}>
    {failed ?? NO_ROOM_YET}
  </div>
);
const Typists = chunked(async () => ({ default: (await import("./Typists.tsx")).Typists }), {
  waiting: NOBODY,
  failed: () => NOBODY,
});
function TypistsHere({ typing }: { typing: Typing | undefined }) {
  return Object.keys(typing ?? {}).length === 0 ? NOBODY : <Typists typing={typing} />;
}
const LINES = [styles["lines"], styles["fill"]].join(" ");
// The list's place while its code comes, or while the room holds no line: no line, no tab stop; a key pressed meanwhile
// acts on the page as it stands, nothing queued for the lines.
const waiting = (busy: boolean) => <ol aria-label="Messages" aria-busy={busy || undefined} className={LINES} />;

// The list's place until the room's history came: a few lines' shapes at its foot, where the newest lines will stand.
const ARRIVING = (
  <div aria-busy="true" className={[styles["fill"], styles["arriving"]].join(" ")}>
    <SkeletonLines />
  </div>
);

// The room's lines: the list's place while it holds none (nor a call of the chain) or their code comes, then the lines view;
// `arriving`, a skeleton in that place.
function RoomLines({ arriving, ...props }: LinesProps & { arriving: boolean }) {
  // A room the chain told a call of holds one item at least, as a card of its thread among no message.
  const place = use(ChainPlaceContext);
  const told = place !== undefined && props.room === `#${place.slug}` && use(ChainCallsContext).length > 0;
  const asked = useJarvisItems(props.room, props.me).length > 0;
  if (props.lines.length === 0 && !told && !asked) return arriving ? ARRIVING : waiting(false);
  return (
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
  /** The room whose lines are in view: its lines have bars; none for a direct message's. */
  room?: string | undefined;
  /** The partner of the direct message in view: its lines have bars too, with no link and no player. */
  partner?: string | undefined;
  state:
    | {
        lines: readonly Line[];
        members: readonly string[];
        /** The msgid of a line Ergo refused to delete. */
        refused?: string | undefined;
        /** Who is typing, each nick with the time its typing ends. */
        typing?: Typing;
        /** The time of the last line the account read here, Ergo's. */
        read?: string | undefined;
        /** This connection's history page came. */
        paged?: true | undefined;
        /** The msgid of the found message the room is read around, the search's. */
        jump?: string | undefined;
        /** Its reactions. */
        reactions?: readonly Reaction[] | undefined;
        /** Ergo refused one of the page's reactions here. */
        cannotReact?: true | undefined;
      }
    | undefined;
  chat: ErgoState | "off";
  /** What goes under the lines: the composer for an account, a word for a guest. */
  composer?: ReactNode;
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me?: string | undefined;
  /** Deletes a line, the reader's own (the message menu); whether it went out. */
  onDelete: (id: string) => boolean;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss: () => void;
  /** The room read to its newest line, as the reader reaches it. */
  onRead?: ((id: string) => void) | undefined;
  /** What it says while it holds no line, once connected: a conversation's own words. */
  empty?: string | undefined;
  /** The room's lines' verdicts, by msgid, from the server's stream. */
  verdicts?: Readonly<Record<string, StreamEvent["state"]>> | undefined;
  /** Whether the reader saves data (ADR-0002 §8): then no player is offered, nor any verdict asked. */
  saving?: boolean;
  /** What the reader keeps in this room and offers of it: none for a direct message's, which has none. */
  keeping?: RoomKeeping | undefined;
  /** The room's pins, above its lines; none when it holds none. */
  pins?: RoomPins | undefined;
  /** Reacts to a line, or takes the reaction back; whether it went out. */
  onReact?: ((reaction: Reacting) => boolean) | undefined;
  /** Makes a line, by its msgid, the one the composer's next answers. */
  onReply?: ((id: string) => void) | undefined;
  /** Opens a line's thread, by the msgid of its root; none for a direct message's lines. */
  onThread?: ((id: string) => void) | undefined;
  /** Puts a line's words in the composer to correct them, the reader's own (a direct message's). */
  onEdit?: ((id: string) => void) | undefined;
}

// Above the lines: the link's state, said in a status.
function Lead({ status }: { status: ReactNode }) {
  return (
    <p role="status" className={[styles["lead"], styles["status"]].join(" ")}>
      {status}
    </p>
  );
}

/** What a page adds to the room in view (`Shown.view` gives the rest) before it gives its composer. */
export type RoomViewOver = Pick<RoomViewProps, "chat"> & Partial<Omit<RoomViewProps, "room" | "composer" | "chat">>;

// A room with no line: a computer says it in a word; a phone asks for the first line, in the design system's empty state.
function Silence({ word }: { word: string }) {
  const phone = useMedia(PHONE_QUERY);
  return phone ? (
    <div className={styles["lead"]}>
      <EmptyState look="inline" title={word} line="Write the first line." />
    </div>
  ) : (
    <p className={styles["lead"]}>{word}</p>
  );
}

// What a connected room with no line is: arriving while its history is on its way, empty once its page came.
function noneOf(connected: boolean, lines: number, paged: true | undefined): "arriving" | "empty" | undefined {
  if (!connected || lines > 0) return undefined;
  return paged === true ? "empty" : "arriving";
}

export function RoomView(props: RoomViewProps) {
  const { room, state, chat, composer, me, onDelete, onDismiss, onRead } = props;
  const { onReact, onReply, onThread, onEdit, partner } = props;
  const { verdicts, saving = false, keeping, pins } = props;
  const { empty = "No messages yet." } = props;
  const { lines = [], members = [], refused, typing, read, paged, reactions, cannotReact, jump } = state ?? {};
  const connected = chat === "connected";
  const none = noneOf(connected, lines.length, paged);
  return (
    <div className={styles["main"]} data-chat-state={chat}>
      <Lead status={connected ? null : NOTICES[chat]} />
      <PinsAbove key={`${String(room)} pins`} pins={pins} />
      <RoomLines
        key={room}
        arriving={none === "arriving"}
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
        jumped={jump !== undefined}
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
      {none === "empty" ? <Silence word={empty} /> : null}
      {/* A room's, whose place is kept so the composer never moves; a direct message tells none. */}
      {room === undefined ? null : <TypistsHere key={`${room} typing`} typing={typing} />}
      {composer}
    </div>
  );
}
