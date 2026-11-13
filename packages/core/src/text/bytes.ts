// Text as bytes and bytes as hex, for want of a TextEncoder: core has none.

/** The bytes of a text that is ASCII by its schema: past it a code unit would wrap, and two ids be one planet or one room. */
export function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at += 1) {
    const unit = text.charCodeAt(at);
    if (unit > 0x7f) throw new RangeError("a text past ASCII");
    bytes[at] = unit;
  }
  return bytes;
}

/** `bytes` in lower-case hex, two digits each. */
export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
