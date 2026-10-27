// What a line's bar offers an account of what it keeps and of the room's pins (slice 4's 4d): Pin for a reader who may
// pin, Save message and Mark unread in the menu, each act saying in the room's flash why it did not happen.
import type { Line } from "@gnoworld/core";
import { IconButton, type FlashMessage } from "@gnoworld/ui";
import type { Done } from "./askPins.ts";
import { pinProblem, saveProblem } from "./problem.ts";
import type { RoomKeeping } from "./RoomKeeping.ts";

/** What an account may do with the line on its device and, for a moderator, in the room's pins. */
export interface LineKeeping {
  /** Whether the line is saved on the device. */
  saved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onMarkUnread: () => void;
  /** The room's pin and unpin of this line, for a reader who may pin there. */
  pin?: { pinned: boolean; onPin: () => void; onUnpin: () => void } | undefined;
}

// The menu's items for an account: Save message or Remove from saved, which only a plain message takes (an /me or a
// notice would lose its form), and Mark unread, which a line of the reader's own has not (it is read by definition).
export function keptItems(line: Line, own: boolean, keeping: LineKeeping | undefined) {
  if (keeping === undefined) return [];
  const save =
    line.kind !== "message"
      ? []
      : [
          keeping.saved
            ? { label: "Remove from saved", onSelect: keeping.onUnsave }
            : { label: "Save message", onSelect: keeping.onSave },
        ];
  return [...save, ...(own ? [] : [{ label: "Mark unread", onSelect: keeping.onMarkUnread }])];
}

// Pin or Unpin, a button of the bar for a reader who may pin, on a message of an account (the server pins a line of
// an account's, never a guest's, an /me's or a notice).
export function PinButton({ line, pin }: { line: Line; pin: LineKeeping["pin"] }) {
  if (pin === undefined || line.kind !== "message" || line.account === undefined) return null;
  return (
    <IconButton
      icon="pin"
      label={pin.pinned ? "Unpin message" : "Pin message"}
      size="s"
      emphasis="plain"
      onClick={pin.pinned ? pin.onUnpin : pin.onPin}
    />
  );
}

/** A line's keeping for its bar: the room's, bound to the line, each act saying why it did not happen in the flash;
 * none for a guest. */
export function lineKeeping(
  keeping: RoomKeeping | undefined,
  me: string | undefined,
  say: (message: FlashMessage) => void,
): (line: Line) => LineKeeping | undefined {
  if (keeping === undefined || me === undefined) return () => undefined;
  const { pin } = keeping;
  // A pin or an unpin the server answered: nothing to say when it took it, else why not.
  const told = (call: Promise<Done>, what: "pin" | "unpin"): void => {
    call.then(
      (done) => {
        if (!done.ok) say(pinProblem(done.reason, what));
      },
      () => {
        say(pinProblem("network", what));
      },
    );
  };
  return (line) => ({
    saved: keeping.saved.has(line.id),
    onSave: () => {
      const got = keeping.onSave(line.id);
      say(
        got === "full" || got === "none"
          ? saveProblem(got)
          : { title: "Message saved.", line: "Kept on this device only." },
      );
    },
    onUnsave: () => {
      keeping.onUnsave(line.id);
    },
    onMarkUnread: () => {
      keeping.onMarkUnread(line.id);
    },
    pin:
      pin === undefined
        ? undefined
        : {
            pinned: keeping.pinned.has(line.id),
            onPin: () => {
              told(pin.pin(line.id), "pin");
            },
            onUnpin: () => {
              told(pin.unpin(line.id), "unpin");
            },
          },
  });
}
