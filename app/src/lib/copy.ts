// Copying an address, for Share and the arrival banners alike: whether the browser can, and what came of it, in words.

// A browser may have no clipboard at all, or one with no `writeText` (a page that is not secure): it is not typed as absent.
const clipboard = (): Clipboard | undefined => navigator.clipboard;

/** Whether this browser can copy text. */
export const canCopy = (): boolean => typeof clipboard()?.writeText === "function";

/** Copies the address; the words that say what came of it. */
export const copyAddress = (address: string): Promise<string> =>
  navigator.clipboard.writeText(address).then(
    () => "Copied",
    () => "Could not copy the address",
  );
