// The chip under a thread's root (slice 4's 4d threads): how many replies the room's lines hold, a button that opens the
// thread beside the room. A guest sees it too: reading a thread asks no account. One Tab stop on the list's stop line
// alone, as a line's links are (U1); the line's More menu is the keyboard's way to every thread.
import { Chip } from "@gnoworld/ui";

export interface ThreadChipProps {
  /** The root's msgid. */
  id: string;
  /** The replies of its thread, nested ones included. */
  count: number;
  /** Whether its line is the list's one tab stop. */
  stop: boolean;
  onThread: (id: string) => void;
}

export function ThreadChip({ id, count, stop, onThread }: ThreadChipProps) {
  const text = count === 1 ? "1 reply" : `${String(count)} replies`;
  return (
    <Chip
      tone="signal"
      size="xs"
      {...(stop ? {} : { tabIndex: -1 })}
      label={`${text}, open the thread`}
      onClick={() => {
        onThread(id);
      }}
    >
      {text}
    </Chip>
  );
}
