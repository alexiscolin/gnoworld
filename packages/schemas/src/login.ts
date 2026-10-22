// The login's bodies (slice 3's plan, 3c): what the browser sends, what the server answers. A request
// takes no field it does not know; Adena's proof comes as the SDK types it, each part bounded.
import { z } from "zod";
import { Address } from "./address.ts";

export const ChallengeRequest = z.strictObject({ chainId: z.string().min(1).max(50) });

export const Challenge = z.object({ nonce: z.string(), text: z.string(), expiresAt: z.iso.datetime() });
export type Challenge = z.infer<typeof Challenge>;

// Adena's answer to signArbitrary (the SDK's SignedArbitraryData). The verifier reads it whole and
// refuses any document but the canonical one, so these bounds only cap its size.
export const Proof = z.object({
  signed: z.object({
    chain_id: z.string().max(50),
    account_number: z.string().max(20),
    sequence: z.string().max(20),
    fee: z.object({
      amount: z.array(z.object({ denom: z.string().max(64), amount: z.string().max(64) })).max(4),
      gas: z.string().max(20),
    }),
    msgs: z.array(z.unknown()).max(4),
    memo: z.string().max(256),
  }),
  signature: z.object({
    pubKey: z.object({ typeUrl: z.string().max(64), value: z.string().max(64) }),
    signature: z.string().max(128),
  }),
});
export type Proof = z.infer<typeof Proof>;

// The nonce as the server writes it: 128 random bits in base64url.
export const VerifyRequest = z.strictObject({ nonce: z.string().regex(/^[\w-]{22}$/), address: Address, proof: Proof });
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const Me = z.object({ address: Address });
export type Me = z.infer<typeof Me>;

// A ticket for Ergo is asked with an empty JSON object, {}: the cookie names the account.
export const TicketRequest = z.strictObject({});
export const Ticket = z.object({ ticket: z.string() });
export type Ticket = z.infer<typeof Ticket>;
