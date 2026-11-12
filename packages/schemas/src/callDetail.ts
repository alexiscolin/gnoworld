// A call's detail (GET /api/calls/<hash>/<index>): what one call of a transaction did, read by the server from the indexer and cut to
// these caps. Every text is a stranger's, already stripped of control and format characters and cut; the page strips and cuts it again.
import { Address } from "./address.ts";
import { z } from "./zod.ts";

export const CALL_CAPS = {
  args: 10,
  events: 5,
  attrs: 6,
  arg: 200,
  memo: 140,
  error: 512,
  key: 40,
  value: 100,
  type: 64,
} as const;

/** A transaction's hash in the address of a route: base64 without padding, `-` and `_` for `+` and `/` (a `/` would split the path). */
export const CallHash = z.string().check(z.regex(/^[A-Za-z0-9_-]{43}$/));

/** The message's place in its transaction. */
export const CallIndex = z.string().check(z.regex(/^\d{1,2}$/));

/** A hash as the indexer writes it (standard base64, padded), from the route's. */
export const indexerHash = (hash: string): string => `${hash.replaceAll("-", "+").replaceAll("_", "/")}=`;

/** A hash as a route writes it, from the chain's event id (`<hash>:<index>`), or undefined for an id that has none. */
export function callAddress(id: string): { hash: string; index: number } | undefined {
  const [hash = "", index = "", ...rest] = id.split(":");
  const route = hash.replaceAll("+", "-").replaceAll("/", "_").replace(/=$/, "");
  return rest.length === 0 && CallHash.safeParse(route).success && CallIndex.safeParse(index).success
    ? { hash: route, index: Number(index) }
    : undefined;
}

const count = () => z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.nonnegative());
const text = (max: number) => z.string().check(z.maxLength(max));

export const CallDetail = z.strictObject({
  height: count(),
  /** The block's time, or null when the indexer did not give it. */
  time: z.nullable(z.iso.datetime()),
  caller: Address,
  realm: z.string().check(z.maxLength(256), z.regex(/^gno\.land\/r\/[a-z0-9][a-z0-9_/-]*$/)),
  func: text(64),
  success: z.boolean(),
  /** The chain's error text of a failed call. */
  error: z.nullable(text(CALL_CAPS.error)),
  gas: z.strictObject({ used: count(), wanted: count() }),
  fee: z.nullable(z.strictObject({ amount: count(), denom: z.string().check(z.regex(/^[a-z]{2,16}$/)) })),
  send: z.nullable(text(64)),
  memo: z.nullable(text(CALL_CAPS.memo)),
  args: z.array(text(CALL_CAPS.arg)).check(z.maxLength(CALL_CAPS.args)),
  moreArgs: count(),
  events: z
    .array(
      z.strictObject({
        type: text(CALL_CAPS.type),
        attrs: z
          .array(z.strictObject({ key: text(CALL_CAPS.key), value: text(CALL_CAPS.value) }))
          .check(z.maxLength(CALL_CAPS.attrs)),
      }),
    )
    .check(z.maxLength(CALL_CAPS.events)),
  moreEvents: count(),
});
export type CallDetail = z.infer<typeof CallDetail>;
