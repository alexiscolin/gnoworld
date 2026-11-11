import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// F13951: the container's cap is 256 MiB with a 90 MiB heap (measured at 210 MiB at the 2 Mpx cap, D13943) (deploy/compose.yaml); the codecs at the cap (2,000 by 1,000 = 2 Mpx PNG twice, a
// 4,096 by 488 JPEG) must fit under it. The child runs as the image does, same flags; the peak resident memory is read from the kernel's
// own count. The bound is the cap less a margin for Node's own growth under load; a failure here decides the number in compose.yaml.
const CAP_KB = 256 * 1024;
const MARGIN_KB = 8 * 1024;

describe("the real codecs at the cap, under the container's heap", () => {
  it("make their pictures and stay under the container's memory", () => {
    const out = execFileSync(
      process.execPath,
      [
        "--disallow-code-generation-from-strings",
        "--max-old-space-size=90",
        new URL("./memory.ts", import.meta.url).pathname,
      ],
      { encoding: "utf8" },
    );
    const { made, maxRssKb } = JSON.parse(out) as {
      made: ({ width: number; height: number } | null)[];
      maxRssKb: number;
    };
    expect(made).toEqual([
      { width: 160, height: 80 },
      { width: 160, height: 80 },
      { width: 160, height: 19 },
    ]);
    expect(maxRssKb).toBeLessThan(CAP_KB - MARGIN_KB);
  }, 60_000);
});
