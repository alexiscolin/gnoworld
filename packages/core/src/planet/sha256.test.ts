import { describe, expect, it } from "vitest";
import { sha256 } from "./sha256.ts";

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (character) => character.charCodeAt(0));
const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

// FIPS 180-4's examples, and digests from Python's hashlib for the lengths where the padding turns over.
describe("sha256", () => {
  it("gives the standard's digests", () => {
    expect(hex(sha256(ascii("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(sha256(ascii("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(sha256(ascii("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it.each([
    [55, "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"],
    [56, "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"],
    [63, "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34"],
    [64, "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"],
    [65, "635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0"],
    [119, "31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb"],
    [120, "2f3d335432c70b580af0e8e1b3674a7c020d683aa5f73aaaedfdc55af904c21c"],
  ])("pads a message of %i bytes where the block turns over", (length, digest) => {
    expect(hex(sha256(new Uint8Array(length).fill(0x61)))).toBe(digest);
  });

  it("carries a long message's length past one block's worth, as the standard's million bytes", () => {
    expect(hex(sha256(new Uint8Array(1_000_000).fill(0x61)))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("reads every byte value as unsigned", () => {
    expect(hex(sha256(Uint8Array.from({ length: 256 }, (_, byte) => byte)))).toBe(DIGEST_OF_ALL_BYTES);
  });

  it("reads the view it is given, not the buffer under it", () => {
    const around = Uint8Array.from([0xff, 0x61, 0x62, 0x63, 0xff]);
    expect(hex(sha256(around.subarray(1, 4)))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("returns 32 bytes and leaves its input as it found it", () => {
    const message = ascii("abc");
    expect(sha256(message)).toHaveLength(32);
    expect(Array.from(message)).toEqual([0x61, 0x62, 0x63]);
  });
});

// hashlib.sha256(bytes(range(256))).hexdigest()
const DIGEST_OF_ALL_BYTES = "40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880";
