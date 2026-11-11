// A child process of memory.test.ts (not part of the image): the real codecs on the largest pictures the reader accepts, under the heap the
// container gives it, then the peak resident memory, for the test to hold to the container's cap.
import { readFileSync } from "node:fs";
import { reencode, wasmCodecs } from "./picture.ts";

const file = (name: string) => readFileSync(new URL(`./testdata/${name}`, import.meta.url));
const made = [];
for (const name of ["big.png", "big.png", "big.jpg"]) {
  const picture = await reencode(file(name), wasmCodecs);
  made.push(picture === null ? null : { width: picture.width, height: picture.height });
}
process.stdout.write(JSON.stringify({ made, maxRssKb: process.resourceUsage().maxRSS }));
