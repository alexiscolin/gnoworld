// What the stories, their tests and the overview draw with: a planet's picture made here, so no story
// asks another host for one (slice 7 draws the planets), a day of calls, hour by hour, and addresses.
export function disc(colour: string) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%23${colour}'/%3E%3C/svg%3E`;
}

// An address's shape, no account's: g1, then 38 letters of bech32's alphabet.
export const ADDRESS = "g1qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9";

export const DAY = [4, 3, 2, 2, 1, 1, 3, 8, 14, 22, 30, 34, 41, 38, 36, 40, 52, 70, 96, 88, 61, 40, 22, 12];

// Addresses of mainnet (gno.land/r/<address>/… namespaces, read through gnomcp on 2026-10-21), each
// named by its short form, as a person with no registered name is.
export const PEOPLE = [
  "g1leu8d2vsplhehcfkjg50mwgdpxdkt8tztu95wr",
  "g12yg9nh4ncma44emgm8msxe8aavzywt0p95tanv",
  "g1747t5m2f08plqjlrjk2q0qld7465hxz8gkx59c",
  "g17cjym5e9hhws46lt6329pv2gtx2ay0503hgems",
  "g19t6f4f4ptt3m949jznalfsx2h8aj696llul0nj",
  "g1ecsuj0q572jr0dhu29q9njtnmw03hyu7tyyvv6",
  "g1j4ehkkrqcr53a233wamtvqggt3skr86c6777xd",
  "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt",
] as const;
export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// 200 addresses' shapes, each letter the top 5 bits of a fixed 32-bit generator (Numerical Recipes'
// constants), so the spread at 20 px is measured on the same faces every run.
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
let seed = 1;
const letter = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return BECH32.charAt(seed >>> 27);
};
export const SPREAD = Array.from({ length: 200 }, () => `g1${Array.from({ length: 38 }, letter).join("")}`);

// The figures band's four cells, for its story and the overview.
export const FIGURES = [
  {
    key: "calls",
    label: "Calls",
    value: 21480,
    sub: "direct calls · 912 in the last 30 days",
    spark: [2, 5, 9, 4, 12, 30, 8, 3, 6, 21],
  },
  { key: "callers", label: "Callers", value: 312, sub: "distinct addresses, all time" },
  { key: "last", label: "Last call", value: 2, unit: "min ago", sub: "Swap · Nov 9" },
  { key: "importers", label: "Imported by", value: "Never", sub: "nothing imports it yet" },
];
