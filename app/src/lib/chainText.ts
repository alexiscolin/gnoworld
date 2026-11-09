// The words of the chain a page draws (slice 9g), the second wall after the stream's schemas: text and nothing else, an address by its two ends.

// Format characters (bidi overrides among them) and controls out.
const stripped = (text: string): string => text.replace(/[\p{Cf}\p{Cc}]/gu, "");

// Stripped, 64 characters at most.
export const plain = (text: string): string => stripped(text).slice(0, 64);

// An address by its two ends: never the whole of it, which a reader could take for a name.
export const short = (address: string): string => {
  const text = plain(address);
  return text.length <= 12 ? text : `${text.slice(0, 6)}…${text.slice(-4)}`;
};
