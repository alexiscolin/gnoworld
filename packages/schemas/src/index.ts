// The bodies that cross a boundary, one Zod schema each, read by the server and its clients alike
// (docs/ARCHITECTURE.md, "Outside data has one schema").
import { z } from "./zod.ts";

export { ActivityRooms } from "./activity.ts";
export { Address, ADDRESS_PROBLEMS, shortAddress, toAddress, type AddressProblem } from "./address.ts";
export {
  BubbleRules,
  EarthOrbit,
  EarthRooms,
  Ecosystems,
  EMBED_PREFIXES,
  Events,
  Genres,
  Hubs,
  News,
  RealmPath,
  UNDATED_EVENT,
  Universes,
} from "./data.ts";
export { Expedition, Quests } from "./discovery.ts";
export { OnAir, XPosts } from "./feeds.ts";
export { QueryAnswer, StatusAnswer } from "./chain.ts";
export { Day } from "./day.ts";
export { CreateRoom, MadeRoom, RoomId, RoomList, RoomName, RoomType } from "./rooms.ts";
export { MARKET_SYMBOLS, MarketBlock, MarketToken, Markets } from "./markets.ts";
export { PinId, PinList, PinnedLine, PinRequest, PINS_MAX, Time } from "./pins.ts";
export { LineVerdicts, StreamEvent, StreamSince, VerdictId, VERDICTS_ASKED } from "./stream.ts";
export { Challenge, ChallengeRequest, Me, Nonce, Proof, Ticket, TicketRequest, VerifyRequest } from "./login.ts";
// The worlds' count (7n2), which the home's hero reads, in the barrel and so in the store's chunk: its head is the worlds' file's too (behind
// indexer.ts's door), and a module both the first screen and the scene's chunk import would be a chunk that every lazy chunk names.
export { WORLDS_COUNT_MAX_BYTES, WorldsCount } from "./worldsHead.ts";

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
