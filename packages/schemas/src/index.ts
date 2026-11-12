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
  holdsHidden,
  Events,
  Genres,
  Hubs,
  News,
  RealmPath,
  UNDATED_EVENT,
  Universes,
} from "./data.ts";
export { Expedition, Quests } from "./discovery.ts";
export { BlogPost, OnAir } from "./feeds.ts";
export { CallRequest } from "./call.ts";
export { CALL_CAPS, CallDetail, CallHash, CallIndex, callAddress, indexerHash } from "./callDetail.ts";
export { CARD_CAPS, CardEvent, CardRemove, LineCards, LinkCard, ReaderCard } from "./cards.ts";
// The one rule for hidden (Cc, Cf) characters, which the link reader applies to a page's text.
export { hasHidden, stripHidden } from "./hidden.ts";
export { QueryAnswer, StatusAnswer } from "./chain.ts";
export { Day } from "./day.ts";
// The chain events' schemas are values at "@gnoworld/schemas/chainEvents" (a page loads them on its first event, in a chunk of its own); here, the types.
export type { ChainEvent, RealmsDeployed } from "./chainEvents.ts";
export {
  ASK_WAIT_S,
  AnswerButton,
  Digest,
  DigestBlock,
  DOOR_CAPS,
  EXPLAIN_VERSION,
  JARVIS_CAPS,
  JARVIS_LINES,
  JARVIS_KEY_HEADER,
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
  JarvisPaidAnswer,
  JarvisQuestion,
  JarvisSettings,
  JarvisState,
  JarvisTranslate,
  JarvisTranslation,
  ProposedAction,
  TRANSLATION_CAPS,
} from "./jarvis.ts";
export { JARVIS_EXAMPLES, jarvisExamples } from "./jarvisExamples.ts";
export { CreateRoom, MadeRoom, RealmRoomRequest, RoomId, RoomList, RoomName, RoomType } from "./rooms.ts";
export { MARKET_SYMBOLS, MarketBlock, MarketToken, Markets } from "./markets.ts";
export { PinId, PinList, PinnedLine, PinRequest, PINS_MAX, Time } from "./pins.ts";
export {
  SEARCH_PAGE,
  SEARCH_Q_MAX,
  SEARCH_Q_MIN,
  SEARCH_SNIPPET,
  SearchHit,
  SearchPage,
  SearchQuery,
} from "./search.ts";
export { Unread, UnreadPlaces, UNREAD_COUNT_MOST, UNREAD_PLACES_MOST } from "./unread.ts";
export { ChartAnswer, ChartRequest, Signal } from "./signals.ts";
export { Key, Slug } from "./slug.ts";
export { Guest, GuestCause, GuestRefusal, GuestSaid, GuestSayRequest } from "./guest.ts";
export { LineTranslations, TRANSLATIONS_ASKED, TranslationEvent } from "./translations.ts";
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
export {
  EXPLAIN_CAPS,
  EXPLAIN_KINDS,
  Explanation,
  ExplainKind,
  ExplainSeed,
  ExplainSeedRow,
  JarvisExplained,
  JarvisExplainRequest,
  REALM_EXPLAIN_VERSION,
  REALM_TAGS,
  RealmExplanation,
  tagsOf,
  type RealmTag,
} from "./explain.ts";
