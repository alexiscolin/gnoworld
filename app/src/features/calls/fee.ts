// The card's fee line (9d, answer 9d-1): an estimate, the median fee the function's last successful calls paid, with the block it
// stands on. Adena simulates the call again and sets the real gas and fee when the person signs (reports/slice-9d-fee.md).
import type { CallFees } from "@gnoworld/chain/fees";
import { grouped } from "@gnoworld/ui";

const UGNOT = 1_000_000;

// Whole ugnot as GNOT with at most six decimals, in integers: a float would round a half ugnot unpredictably.
function gnotOf(ugnot: number): string {
  const whole = Math.floor(ugnot / UGNOT);
  const decimals = String(ugnot % UGNOT)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return decimals === "" ? String(whole) : `${String(whole)}.${decimals}`;
}

/** The fee line of a read of the fees, or the words that Adena sets it when there is none to go by. */
export function feeText(read: CallFees | undefined): string {
  if (read === undefined || read.fees.length === 0) return "Set by Adena when you sign";
  const sorted = read.fees.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const [low = 0, high = 0] = [sorted[sorted.length % 2 === 0 ? middle - 1 : middle], sorted[middle]];
  // Two middle fees: the half between them, rounded up, never beyond the integers a number holds.
  const median = low + Math.round((high - low) / 2);
  return `≈ ${gnotOf(median)} GNOT, an estimate from calls up to block ${grouped(read.height)}`;
}
