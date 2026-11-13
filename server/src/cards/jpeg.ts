// A JPEG's real size, from its first frame header: the reader's claim about its picture is not taken (a header of 10,000 px).
// A start-of-frame marker: C0 to CF but the Huffman table (C4), the JPEG extension (C8) and the arithmetic conditioning (CC).
const isFrame = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
const word = (bytes: Uint8Array, at: number): number => ((bytes[at] ?? 0) << 8) + (bytes[at + 1] ?? 0);

export function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  let at = 2;
  while (at + 9 < bytes.length && bytes[at] === 0xff) {
    if (isFrame(bytes[at + 1] ?? 0)) return { height: word(bytes, at + 5), width: word(bytes, at + 7) };
    at += 2 + word(bytes, at + 2);
  }
  return undefined;
}
