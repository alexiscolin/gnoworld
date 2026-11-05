// The bodies that cross a boundary, one Zod schema each, read by the server and its clients alike
// (docs/ARCHITECTURE.md, "Outside data has one schema").
import { z } from "./zod.ts";

export { ActivityRooms } from "./activity.ts";
export { Address, ADDRESS_PROBLEMS, toAddress, type AddressProblem } from "./address.ts";
export {
  BubbleRules,
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
export { CallRequest } from "./call.ts";
export { QueryAnswer, StatusAnswer } from "./chain.ts";
export {
  AnswerButton,
  Digest,
  DigestBlock,
  DOOR_CAPS,
  JARVIS_CAPS,
  JARVIS_LINES,
  JARVIS_PATHS,
  JarvisAnswer,
  JarvisAsk,
  JarvisBudget,
  JarvisBudgets,
  JarvisChange,
  JarvisChangeRequest,
  JarvisDigest,
  JarvisDigestRequest,
  JARVIS_LANGUAGES,
  JarvisMadeDigest,
  JarvisQuestion,
  JarvisSettings,
  JarvisTranslate,
  JarvisTranslateRequest,
  JarvisTranslation,
  ProposedAction,
  TRANSLATION_CAPS,
} from "./jarvis.ts";
export { CreateRoom, MadeRoom, RoomId, RoomList, RoomName, RoomType } from "./rooms.ts";
export { MARKET_SYMBOLS, MarketBlock, MarketToken, Markets } from "./markets.ts";
export { PinId, PinList, PinnedLine, PinRequest, PINS_MAX, Time } from "./pins.ts";
export { ChartAnswer, ChartRequest, Signal } from "./signals.ts";
export { Slug } from "./slug.ts";
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
