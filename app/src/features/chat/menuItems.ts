// A line's More menu items (slice 4's 4c, 4d), apart from LineActions.tsx.
import type { MenuItem } from "@gnoworld/ui";

// The More menu's items: the two copies, Open thread when the page opens threads, what the reader keeps of the line,
// and Delete, apart, when the reader may.
export function menuItems(
  acts: {
    onCopy: (what: "text" | "link") => void;
    onThread?: ((id: string) => void) | undefined;
    /** What the reader keeps of the line: Save, Mark unread (4d). */
    kept?: readonly MenuItem[];
    onDelete?: (() => void) | undefined;
  },
  id: string,
): MenuItem[] {
  const { onCopy, onThread, kept = [], onDelete } = acts;
  return [
    {
      label: "Copy text",
      onSelect: () => {
        onCopy("text");
      },
    },
    {
      label: "Copy room link",
      onSelect: () => {
        onCopy("link");
      },
    },
    ...(onThread === undefined
      ? []
      : [
          {
            label: "Open thread",
            onSelect: () => {
              onThread(id);
            },
          },
        ]),
    ...kept,
    ...(onDelete === undefined ? [] : [{ label: "Delete", tone: "danger" as const, onSelect: onDelete }]),
  ];
}
