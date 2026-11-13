// What the format bar and its link tool share with the editor's commands, apart from the editor itself: the bar is in a visitor's
// chunk too (a guest's box), which must not carry the editor's code.

/** What the format bar applies in place; the link has its popover (LinkTool.tsx). */
export type Format = "bold" | "italic" | "underline" | "strike" | "code" | "quote" | "bulleted" | "numbered";

/** Whether `address` is one a link may go to: https, as the room's reader links. */
export const isAddress = (address: string): boolean => /^https:\/\/[^\s()<>\\]+$/.test(address);
