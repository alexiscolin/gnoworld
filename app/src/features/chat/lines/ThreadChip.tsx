// The chip under a thread's root: how many replies the room's lines hold, a button that opens the
// thread beside the room. A guest sees it too: reading a thread asks no account. One Tab stop on the list's stop line
// alone, as a line's links are; the line's More menu is the keyboard's way to every thread. Replies the reader has not seen
// are counted after its words in the coral of what is unseen, as the bell's and the worlds' pills are.
import { Chip } from "@gnoworld/ui";

export interface ThreadChipProps {
  /** The root's msgid. */
  id: string;
  /** The replies of its thread, nested ones included. */
  count: number;
  /** Its replies the reader has not seen yet (rooms/unseen.ts); none or 0 counts nothing. */
  unseen?: number | undefined;
  /** Whether its line is the list's one tab stop. */
  stop: boolean;
  onThread: (id: string) => void;
}

export function ThreadChip({ id, count, unseen = 0, stop, onThread }: ThreadChipProps) {
  const text = count === 1 ? "1 reply" : `${String(count)} replies`;
  const fresh = unseen > 0 ? { count: unseen, countTone: "new" as const } : {};
  return (
    <Chip
      tone="signal"
      size="xs"
      {...(stop ? {} : { tabIndex: -1 })}
      {...fresh}
      label={unseen > 0 ? `${text}, ${String(unseen)} unread, open the thread` : `${text}, open the thread`}
      onClick={() => {
        onThread(id);
      }}
    >
      {text}
    </Chip>
  );
}
