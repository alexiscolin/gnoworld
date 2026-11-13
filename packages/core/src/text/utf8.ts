// Text measured as UTF-8 without encoding it: core has no TextEncoder.

/** The bytes `text` takes in UTF-8, as a TextEncoder counts them (a lone half of a pair is three, as the character replacing it),
 * counted up to `upTo` and no further: a count past it is some number above it. */
export function utf8Bytes(text: string, upTo = Infinity): number {
  let size = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    size += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    if (size > upTo) break;
  }
  return size;
}
