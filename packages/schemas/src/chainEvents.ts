// What the server tells a page of the chain (slice 9g, D260 to D269), on the stream's own events `chain` and `realms`. Every
// text is a name the chain's own rules bound (an address, a realm's path, a function's name), and no text of a transaction's
// args or memo ever travels: what a stranger wrote reaches a room as bounded names or not at all. The height is the block a
// fact stands at, so a reader sees where a gap is; nothing is a time, a transaction having none.
import { Address } from "./address.ts";
import { Key } from "./slug.ts";
import { z } from "./zod.ts";

/** The longest function name and realm path, in characters. A realm's path is not `RealmPath` (data.ts, 128): a path an account deploys under its own address and nested names can be longer, and a deploy shows whatever the chain accepted. */
const CHAIN_CAPS = { func: 64, realm: 256, id: 140 } as const;

const height = () => z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.nonnegative());
/** Where an event stands: its transaction's hash and its message's place in it (`hash:index`), the key a page draws it under. */
const id = () => z.string().check(z.minLength(1), z.maxLength(CHAIN_CAPS.id));
const realm = () =>
  z.string().check(z.maxLength(CHAIN_CAPS.realm), z.regex(/^gno\.land\/r\/[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/));

/** A call to a world's realm, or a realm deployed (which names no world and no function): an event of the chain at a block. */
export const ChainEvent = z.union([
  z.strictObject({
    id: id(),
    kind: z.literal("call"),
    universe: Key,
    world: Key,
    realm: realm(),
    actor: Address,
    func: z.string().check(z.maxLength(CHAIN_CAPS.func), z.regex(/^[A-Za-z_][A-Za-z0-9_]*$/)),
    height: height(),
  }),
  z.strictObject({
    id: id(),
    kind: z.literal("deploy"),
    universe: Key,
    realm: realm(),
    actor: Address,
    height: height(),
  }),
]);
export type ChainEvent = z.infer<typeof ChainEvent>;

/** The realms deployed in a universe in the last 24 hours, by block time, and the block the count stood at. */
export const RealmsDeployed = z.strictObject({
  universe: Key,
  count: z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.nonnegative()),
  height: height(),
});
export type RealmsDeployed = z.infer<typeof RealmsDeployed>;
