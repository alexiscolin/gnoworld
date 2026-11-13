// What the room's name opens (the video's chevron after it): what the room says of itself, then what an account adds
// (its notification modes, whom it hears direct messages from). It holds what once stood above the lines and in the
// rooms' column, so none of it is lost to the video's plainer look.
import { Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";

export interface RoomMenuProps {
  /** What the room says of itself: its description, a conversation's "not encrypted". */
  note?: ReactNode;
  /** The note's id, which the composer points at (4e's U6). */
  noteId?: string | undefined;
  /** What an account adds below the note. */
  children?: ReactNode;
}

/** One of the menu's choices: its name in the label's type, its control, and what it does in the small muted type under it. */
export function Setting({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <Stack space="xs" as="section">
      <h3 className="label">{label}</h3>
      {children}
      {help === undefined ? null : <div className="meta">{help}</div>}
    </Stack>
  );
}

/** Whether the room says anything of itself: a visitor's menu with no note is not offered. */
export const hasNote = (note: ReactNode) => note !== undefined && note !== "";

/** The header's menu for a visitor's room: its note alone, none when the room says nothing of itself. */
export const visitorMenu = (note: ReactNode) =>
  hasNote(note) ? { label: "Room", content: <RoomMenu note={note} /> } : undefined;

export function RoomMenu({ note, noteId, children }: RoomMenuProps) {
  return (
    <Stack space="l">
      {hasNote(note) ? <p id={noteId}>{note}</p> : null}
      {children}
    </Stack>
  );
}
