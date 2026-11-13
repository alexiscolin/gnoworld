// Copying a text, for Share, the arrival banners, a line, a command and a search's link alike: whether the browser can, and what came of it.

// A browser may have no clipboard at all, or one with no `writeText` (a page that is not secure): it is not typed as absent.
const clipboard = (): Clipboard | undefined => navigator.clipboard;

/** Whether this browser can copy text. */
export const canCopy = (): boolean => typeof clipboard()?.writeText === "function";

/** Copies `text`: true once the clipboard took it, false when the browser refused or has no clipboard. Never throws; the clipboard is
 * asked at once, within the press that asked for the copy. */
export const copyText = (text: string): Promise<boolean> =>
  (canCopy() ? navigator.clipboard.writeText(text) : Promise.reject(new Error("no clipboard"))).then(
    () => true,
    () => false,
  );

/** Copies the address; the words that say what came of it. */
export const copyAddress = (address: string): Promise<string> =>
  copyText(address).then((copied) => (copied ? "Copied" : "Could not copy the address"));
