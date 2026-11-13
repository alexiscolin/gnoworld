// The login's bodies (slice 3's plan, 3c): what the browser sends, what the server answers. A request's own
// fields are strict; Adena's proof comes as the SDK types it.
import { z } from "./zod.ts";
import { Address } from "./address.ts";
import { ChainId } from "./realmPath.ts";

export const ChallengeRequest = z.strictObject({ chainId: ChainId });

// The nonce as the server writes it, 128 random bits in base64url: one schema for the challenge and the proof (F673).
export const Nonce = z.string().check(z.regex(/^[\w-]{22}$/));

export const Challenge = z.object({ nonce: Nonce, text: z.string(), expiresAt: z.iso.datetime() });
export type Challenge = z.infer<typeof Challenge>;

// Adena's answer to signArbitrary (the SDK's SignedArbitraryData): a key it does not know is dropped, msgs'
// items bounded by the body's 16 KiB alone. The SDK checks the signature over the canonical document it rebuilds
// from signer, chain and text, so nothing dropped was ever signed (F672).
export const Proof = z.object({
  signed: z.object({
    chain_id: z.string().check(z.maxLength(50)),
    account_number: z.string().check(z.maxLength(20)),
    sequence: z.string().check(z.maxLength(20)),
    fee: z.object({
      amount: z
        .array(z.object({ denom: z.string().check(z.maxLength(64)), amount: z.string().check(z.maxLength(64)) }))
        .check(z.maxLength(4)),
      gas: z.string().check(z.maxLength(20)),
    }),
    msgs: z.array(z.unknown()).check(z.maxLength(4)),
    memo: z.string().check(z.maxLength(256)),
  }),
  signature: z.object({
    pubKey: z.object({
      typeUrl: z.string().check(z.maxLength(64)),
      value: z.string().check(z.maxLength(64)),
    }),
    signature: z.string().check(z.maxLength(128)),
  }),
});
export type Proof = z.infer<typeof Proof>;

export const VerifyRequest = z.strictObject({ nonce: Nonce, address: Address, proof: Proof });
export type VerifyRequest = z.infer<typeof VerifyRequest>;

// The account logged in, or null: nobody is an answer, not a refusal, so a visitor's page logs no error.
export const Me = z.object({ address: z.nullable(Address) });
export type Me = z.infer<typeof Me>;

// A ticket for Ergo is asked with an empty JSON object, {}: the cookie names the account.
export const TicketRequest = z.strictObject({});
export const Ticket = z.object({ ticket: z.string() });
export type Ticket = z.infer<typeof Ticket>;
