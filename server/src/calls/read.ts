// The server's one read of a call's detail: the transaction by its hash, then its block's time, through the way out's byte cap and a
// schema each. The answer is a stranger's text: stripped of control and format characters and cut before it is kept or served.
import { blockTimes } from "@gnoworld/chain/asks";
import { callAsk } from "@gnoworld/chain/callAsk";
import { CALL_DETAIL_CAPS, CallDetail, strictUtf8, stripHidden } from "@gnoworld/schemas";
import { fetchCapped, jsonOrFail, type Send } from "@gnoworld/service/net";
import { z } from "zod";
import { parseBlockTimes } from "../worlds/blockDays.ts";
import { Failure } from "../worlds/remote.ts";

const CALL_MS = 5000;
/** A transaction's arguments may be large; the read is cut here, the answer is cut far lower. */
const CALL_MAX_BYTES = 64 * 1024;
const TIME_MAX_BYTES = 4 * 1024;

const whole = z.number().int().nonnegative();
const Row = z.object({
  block_height: whole,
  success: z.boolean(),
  gas_wanted: whole,
  gas_used: whole,
  gas_fee: z.object({ amount: whole, denom: z.string() }).nullable(),
  memo: z.string().nullish(),
  messages: z
    .array(
      z.object({
        value: z.object({
          __typename: z.string(),
          caller: z.string().optional(),
          pkg_path: z.string().optional(),
          func: z.string().optional(),
          args: z.array(z.string()).max(5000).nullish(),
          send: z.string().nullish(),
        }),
      }),
    )
    .max(1000),
  response: z
    .object({
      error: z.string().nullish(),
      events: z
        .array(
          z.object({
            type: z.string().optional(),
            attrs: z
              .array(z.object({ key: z.string(), value: z.string() }))
              .max(1000)
              .nullish(),
          }),
        )
        .max(5000)
        .nullish(),
    })
    .nullable(),
});
const Answer = z.object({
  data: z.object({ getTransactions: z.array(Row).max(1).nullable() }),
  errors: z.optional(z.never()),
});

const cut = (text: string, max: number): string => Array.from(stripHidden(text)).slice(0, max).join("");
const orNull = (text: string | null | undefined, max: number): string | null => {
  const kept = cut(text ?? "", max);
  return kept === "" ? null : kept;
};

/** What a call's read found: the call, no transaction under the hash (not indexed yet), or a transaction whose message there is no call. */
export type Found = { kind: "call"; detail: CallDetail } | { kind: "absent" } | { kind: "none" };

async function ask(where: { send: Send; indexer: string; maxBytes: number }, body: object): Promise<unknown> {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  };
  const bytes = await fetchCapped(where.send, { url: where.indexer, init }, { ms: CALL_MS, maxBytes: where.maxBytes });
  const text = strictUtf8(bytes);
  if (text === null) throw new Failure("shape");
  return jsonOrFail(text);
}

// The block's time, or null: a call's detail is worth showing without it.
async function timeOf({ send, indexer }: Reader, height: number): Promise<string | null> {
  try {
    const answer = await ask({ send, indexer, maxBytes: TIME_MAX_BYTES }, blockTimes([height]));
    return parseBlockTimes(answer, [height]).get(height) ?? null;
  } catch {
    return null;
  }
}

type Row = z.infer<typeof Row>;
type Message = Row["messages"][number]["value"];
type Event = NonNullable<NonNullable<Row["response"]>["events"]>[number];

const eventOf = ({ type, attrs }: Event) => ({
  type: cut(type ?? "", CALL_DETAIL_CAPS.type),
  attrs: (attrs ?? []).slice(0, CALL_DETAIL_CAPS.attrs).map(({ key, value }) => ({
    key: cut(key, CALL_DETAIL_CAPS.key),
    value: cut(value, CALL_DETAIL_CAPS.value),
  })),
});

// The detail as the route serves it, from a row and its call: every text stripped and cut.
function detailOf(row: Row, value: Message, time: string | null): unknown {
  const events = (row.response?.events ?? []).filter(({ type }) => type !== undefined);
  const args = value.args ?? [];
  return {
    height: row.block_height,
    time,
    caller: value.caller,
    realm: value.pkg_path,
    func: cut(value.func ?? "", 64),
    success: row.success,
    error: orNull(row.response?.error, CALL_DETAIL_CAPS.error),
    gas: { used: row.gas_used, wanted: row.gas_wanted },
    fee: row.gas_fee,
    send: orNull(value.send, 64),
    memo: orNull(row.memo, CALL_DETAIL_CAPS.memo),
    args: args.slice(0, CALL_DETAIL_CAPS.args).map((arg) => cut(arg, CALL_DETAIL_CAPS.arg)),
    moreArgs: Math.max(0, args.length - CALL_DETAIL_CAPS.args),
    events: events.slice(0, CALL_DETAIL_CAPS.events).map(eventOf),
    moreEvents: Math.max(0, events.length - CALL_DETAIL_CAPS.events),
  };
}

interface Reader {
  send: Send;
  indexer: string;
}

/** The detail of message `index` of the transaction `hash` (the indexer's own spelling); a fault throws a `Failure`. */
export async function readCall(reader: Reader, hash: string, index: number): Promise<Found> {
  const answer = Answer.safeParse(await ask({ ...reader, maxBytes: CALL_MAX_BYTES }, callAsk(hash)));
  if (!answer.success) throw new Failure("shape");
  const [row] = answer.data.data.getTransactions ?? [];
  if (row === undefined) return { kind: "absent" };
  const value = row.messages[index]?.value;
  if (value?.__typename !== "MsgCall") return { kind: "none" };
  // A caller or a realm that is no address or path is not a call of the chain: the same answer as a message of another kind.
  const detail = CallDetail.safeParse(detailOf(row, value, await timeOf(reader, row.block_height)));
  return detail.success ? { kind: "call", detail: detail.data } : { kind: "none" };
}
