// How the market card writes a price and its change, as the home's old prices row did (frame 6).

/** A thousand and more whole and grouped ("66,601"), a dollar and more to the cent, less than a dollar to three significant digits, so a fraction of a cent never reads as zero. */
export const dollars = (usd: number): string =>
  usd >= 1000
    ? usd.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : usd >= 1
      ? usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : usd.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 20 });

/** The change to a tenth: none when the source gives none. */
export const tenthsOf = (percent: number | null): number | null =>
  percent === null ? null : Math.round(percent * 10) / 10;

/** Which way it went; a change that rounds to zero, or none, is flat. */
export const directionOf = (tenths: number | null): "up" | "down" | "flat" =>
  tenths === null || tenths === 0 ? "flat" : tenths > 0 ? "up" : "down";

/** The day's low and high as the compact row's title writes them. */
export const rangeOf = (line: readonly number[]): string =>
  `Low ${dollars(Math.min(...line))} · High ${dollars(Math.max(...line))}`;
