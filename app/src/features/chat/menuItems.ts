// A line's More menu items (slice 4's 4c, 4d), apart from LineActions.tsx.
import type { MenuItem } from "@gnoworld/ui";

// The More menu's items: the copies, Open thread when the page opens threads, what the reader keeps of the line, Edit
// and Delete, apart, when the reader may.
export function menuItems(
  acts: {
    onCopy: (what: "text" | "link") => void;
    /** Copy room link: a room's line alone, a direct message's having no link (4d's DM bar); yes by default. */
    link?: boolean;
    onThread?: ((id: string) => void) | undefined;
    /** What the reader keeps of the line: Save, Mark unread (4d). */
    kept?: readonly MenuItem[];
    /** Puts the line's words in the composer to correct them (4d's edits). */
    onEdit?: (() => void) | undefined;
    onDelete?: (() => void) | undefined;
  },
  id: string,
): MenuItem[] {
  const { onCopy, link = true, onThread, kept = [], onEdit, onDelete } = acts;
  return [
    {
      label: "Copy text",
      onSelect: () => {
        onCopy("text");
      },
    },
    ...(link
      ? [
          {
            label: "Copy room link",
            onSelect: () => {
              onCopy("link");
            },
          },
        ]
      : []),
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
    ...(onEdit === undefined ? [] : [{ label: "Edit", onSelect: onEdit }]),
    ...(onDelete === undefined ? [] : [{ label: "Delete", tone: "danger" as const, onSelect: onDelete }]),
  ];
}
