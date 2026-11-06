import { describe, expect, it } from "vitest";
import { feeText } from "./fee.ts";

// 9d, question 9d-1 option 1: the fee line is an estimate, from what the last calls of the same realm and function paid
// (ugnot) up to a block it names, labelled so; Adena simulates and sets the real fee when the person signs (reports/slice-9d-fee.md).
const read = (fees: number[], height = 55414) => ({ fees, height });
const AT = "an estimate from calls up to block 55,414";

describe("feeText: the card's fee line", () => {
  it("is the median of the fees in GNOT, labelled an estimate that names its block (1 GNOT is 1,000,000 ugnot)", () => {
    expect(feeText(read([48000, 1000000, 52000]))).toBe(`≈ 0.052 GNOT, ${AT}`);
  });

  it("takes the middle of the two middle fees for an even count, and a half ugnot rounds up", () => {
    expect(feeText(read([40000, 60000]))).toBe(`≈ 0.05 GNOT, ${AT}`);
    expect(feeText(read([1, 2]))).toBe(`≈ 0.000002 GNOT, ${AT}`);
  });

  it("writes a whole number of GNOT with no decimals, at most six decimals, and a huge fee whole", () => {
    expect(feeText(read([1000000]))).toBe(`≈ 1 GNOT, ${AT}`);
    expect(feeText(read([1]))).toBe(`≈ 0.000001 GNOT, ${AT}`);
    expect(feeText(read([Number.MAX_SAFE_INTEGER]))).toBe(`≈ 9007199254.740991 GNOT, ${AT}`);
  });

  it("does not depend on the order the fees come in", () => {
    expect(feeText(read([52000, 48000, 1000000]))).toBe(feeText(read([1000000, 52000, 48000])));
  });

  it("says Adena sets it when there is no fee to go by, or the read failed: no block is named", () => {
    expect(feeText(read([], 0))).toBe("Set by Adena when you sign");
    expect(feeText(undefined)).toBe("Set by Adena when you sign");
  });
});
