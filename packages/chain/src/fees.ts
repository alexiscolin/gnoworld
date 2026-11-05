// The fees the last calls of one realm function paid (9d, answer 9d-1): the card's fee line is an estimate from them, with the
// block it stands on. One GET of the public indexer. Its filter lets other messages through (SHARED/recordings/README.md), so
// each row is checked again, and only a successful call with one message of that realm and function counts: a transaction of
// several messages paid one fee for all. A transaction has no time, so the count is bounded, not a date.
import { CALL_FEES_CAPS, CallFeesAnswer } from "@gnoworld/schemas/indexer";
import { failedRead, readChain, sourceOf, type ChainRead, type ReadOptions } from "./read.ts";

type Row = NonNullable<CallFeesAnswer["data"]["getTransactions"]>[number];

/** The realm and the function whose calls are read. */
export interface Call {
  realm: string;
  func: string;
}

export interface CallFees {
  /** The fees in ugnot, newest call first. */
  fees: number[];
  /** The newest block among them; 0 when there is none. */
  height: number;
}

/** The most calls an estimate is made from. */
const LATEST = 20;

// Whether a row is one successful call of `func` in `realm`: one message, the filter's checked again.
function isCallOf(row: Row, { realm, func }: Call): boolean {
  const [message, ...more] = row.messages;
  return row.success === true && more.length === 0 && message?.value?.pkg_path === realm && message.value.func === func;
}

// The fee in ugnot and the block of a good row, else none.
function callOf(row: Row, call: Call): { fee: number; height: number } | undefined {
  const { block_height: height, gas_fee: fee } = row;
  if (!isCallOf(row, call) || fee?.denom !== "ugnot" || !Number.isSafeInteger(fee.amount) || fee.amount < 0)
    return undefined;
  return height !== undefined && Number.isSafeInteger(height) && height > 0 ? { fee: fee.amount, height } : undefined;
}

/** The fees of the latest successful calls of a realm's function, from the indexer at `indexer`, or why not. */
export async function readCallFees(
  indexer: string,
  call: Call,
  options: ReadOptions = {},
): Promise<ChainRead<CallFees>> {
  const { realm, func } = call;
  if (realm.length > CALL_FEES_CAPS.path || func.length > CALL_FEES_CAPS.func)
    return failedRead("bad-name", sourceOf(indexer, options));
  const query =
    "query($path: String!, $func: String!) { getTransactions(where: { success: { eq: true }, messages: { value: { MsgCall: { pkg_path: { eq: $path }, func: { eq: $func } } } } }) { success block_height gas_fee { amount denom } messages { value { ... on MsgCall { pkg_path func } } } } }";
  const variables = JSON.stringify({ path: realm, func });
  const asked = `${indexer}?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(variables)}`;
  const answer = await readChain(asked, CallFeesAnswer, options);
  if (!answer.ok) return answer;
  const rows = (answer.value.data.getTransactions ?? []).flatMap((row) => callOf(row, call) ?? []);
  const newest = rows.toSorted((a, b) => b.height - a.height).slice(0, LATEST);
  return {
    ok: true,
    value: { fees: newest.map(({ fee }) => fee), height: newest[0]?.height ?? 0 },
    source: answer.source,
  };
}
