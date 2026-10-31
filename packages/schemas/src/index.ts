// The bodies that cross a boundary, one Zod schema each, read by the server and its clients alike
// (docs/ARCHITECTURE.md, "Outside data has one schema").
import { z } from "./zod.ts";

export { ActivityRooms } from "./activity.ts";
export { Address, ADDRESS_PROBLEMS, toAddress, type AddressProblem } from "./address.ts";
export {
  Ecosystems,
  EMBED_PREFIXES,
  Events,
  Expedition,
  Genres,
  Hubs,
  News,
  Quests,
  Stations,
  Universes,
} from "./data.ts";
export { QueryAnswer, StatusAnswer } from "./chain.ts";
export { PROPOSAL_CAPS, Proposal } from "./proposal.ts";
export { REALM_FACTS_CAPS, RealmFactsAnswer, type RealmFactsValue } from "./indexer.ts";
export { CreateRoom, MadeRoom, RoomId, RoomList, RoomName, RoomType } from "./rooms.ts";
export { MARKET_SYMBOLS, MarketToken, Markets } from "./markets.ts";
export { PinId, PinList, PinnedLine, PinRequest, PINS_MAX, Time } from "./pins.ts";
export { LineVerdicts, StreamEvent, StreamSince, VerdictId, VERDICTS_ASKED } from "./stream.ts";
export { Challenge, ChallengeRequest, Me, Nonce, Proof, Ticket, TicketRequest, VerifyRequest } from "./login.ts";

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
    "full",
  ]),
});
export type ApiError = z.infer<typeof ApiError>;
