// SHA-256 (FIPS 180-4), for a planet's seed. The browser's own is asynchronous and missing outside a secure context, and core may
// not reach Node's: a look is computed in a frame's worth of code, on any page.

const ROUNDS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const;
const START = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19] as const;
type State = readonly [number, number, number, number, number, number, number, number];
const WORDS = 64;
const BLOCK = 64;

const turned = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

// The block's sixteen words, then the forty-eight the standard derives from them.
function schedule(blocks: DataView, at: number): number[] {
  const words: number[] = [];
  for (let t = 0; t < WORDS; t += 1) {
    if (t < 16) {
      words.push(blocks.getUint32(at + t * 4));
      continue;
    }
    const far = words.at(t - 15) ?? 0;
    const near = words.at(t - 2) ?? 0;
    const small = turned(far, 7) ^ turned(far, 18) ^ (far >>> 3);
    const large = turned(near, 17) ^ turned(near, 19) ^ (near >>> 10);
    words.push(((words.at(t - 16) ?? 0) + small + (words.at(t - 7) ?? 0) + large) | 0);
  }
  return words;
}

function compress(state: State, words: readonly number[]): State {
  let [a, b, c, d, e, f, g, h] = state;
  for (const [t, round] of ROUNDS.entries()) {
    const large = turned(e, 6) ^ turned(e, 11) ^ turned(e, 25);
    const first = (h + large + ((e & f) ^ (~e & g)) + round + (words[t] ?? 0)) | 0;
    const second = ((turned(a, 2) ^ turned(a, 13) ^ turned(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    [h, g, f, e, d, c, b, a] = [g, f, e, (d + first) | 0, c, b, a, (first + second) | 0];
  }
  const [a0, b0, c0, d0, e0, f0, g0, h0] = state;
  return [a + a0, b + b0, c + c0, d + d0, e + e0, f + f0, g + g0, h + h0].map((word) => word | 0) as unknown as State;
}

/** The digest of `message`, 32 bytes. */
export function sha256(message: Uint8Array): Uint8Array {
  const length = Math.ceil((message.length + 9) / BLOCK) * BLOCK;
  const padded = new Uint8Array(length);
  padded.set(message);
  padded[message.length] = 0x80;
  const blocks = new DataView(padded.buffer);
  blocks.setUint32(length - 8, Math.floor(message.length / 0x20000000));
  blocks.setUint32(length - 4, message.length * 8);
  let state: State = START;
  for (let at = 0; at < length; at += BLOCK) state = compress(state, schedule(blocks, at));
  const digest = new DataView(new ArrayBuffer(32));
  for (const [index, word] of state.entries()) digest.setUint32(index * 4, word);
  return new Uint8Array(digest.buffer);
}
