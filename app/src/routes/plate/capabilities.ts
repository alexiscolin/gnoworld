// What a realm can do, from its imports alone (D567: no gnoscope): a token, an NFT, a vote. Absent when its imports say none.
export interface Capability {
  label: string;
  /** What says it, in the realm's own imports. */
  line: string;
}

const KNOWN: readonly { label: string; line: string; has: RegExp }[] = [
  { label: "Token", line: "Imports grc20: it can issue or move a token", has: /\/grc20(\/|$)/ },
  { label: "NFT", line: "Imports grc721: it can hold or move NFTs", has: /\/grc721(\/|$)/ },
  { label: "Governed", line: "Imports r/gov/dao: its changes go to a vote", has: /\/r\/gov\/dao(\/|$)/ },
];

/** The capabilities the imports name, each once. */
export const capabilitiesOf = (imports: readonly string[]): Capability[] =>
  KNOWN.filter(({ has }) => imports.some((path) => has.test(path))).map(({ label, line }) => ({ label, line }));
