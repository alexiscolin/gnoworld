// The bodies that cross a boundary, one Zod schema each, read by the server and its clients alike
// (docs/ARCHITECTURE.md, "Outside data has one schema").
import { z } from "zod";

export { Address, toAddress } from "./address.ts";
export { Challenge, ChallengeRequest, Me, Proof, Ticket, TicketRequest, VerifyRequest } from "./login.ts";

// Every refusal and failure the server answers: a code a client can act on, never a stack or what it sent.
export const ApiError = z.object({
  error: z.enum([
    "not_found",
    "not_ready",
    "too_large",
    "internal",
    "refused",
    "unauthenticated",
    "forbidden",
    "unsupported",
    "too_many",
  ]),
});
export type ApiError = z.infer<typeof ApiError>;
