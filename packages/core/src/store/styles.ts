// What a realm is for, read from its path, its functions and its imports (D373): ten styles, each a few readable rules. A realm may have
// several, or none; Lab is the counters and the tests, which Discover hides unless asked.
import { nameOf } from "./families.ts";

export const STYLES = [
  { id: "games", label: "Games" },
  { id: "tokens", label: "Tokens" },
  { id: "nft", label: "NFT & art" },
  { id: "defi", label: "DeFi" },
  { id: "dao", label: "DAO & governance" },
  { id: "social", label: "Social" },
  { id: "markets", label: "Markets" },
  { id: "identity", label: "Identity" },
  { id: "ai", label: "AI & agents" },
  { id: "lab", label: "Lab" },
] as const;
export type StyleId = (typeof STYLES)[number]["id"];

/** What a realm's rules read. */
export interface Styled {
  path: string;
  functions: readonly string[];
  imports: readonly string[];
}

interface Rule {
  /** Pieces of the name, found anywhere in it. */
  stems?: readonly string[];
  /** Words of the name, found whole: short ones would otherwise be in "chain" or "mail". */
  words?: readonly string[];
  /** Pieces of an import's path. */
  imports?: readonly string[];
  /** Any of these functions. */
  any?: readonly string[];
  /** All of these functions together. */
  all?: readonly string[];
}

const RULES: Readonly<Record<StyleId, Rule>> = {
  games: {
    stems: [
      "game",
      "duel",
      "arena",
      "casino",
      "fish",
      "chess",
      "connect4",
      "lobby",
      "dice",
      "raffle",
      "arcade",
      "poker",
    ],
    words: ["quest", "tic", "rps"],
    any: ["Play", "Bet", "JoinPvpLobby", "PlaceCasinoBet"],
  },
  tokens: { imports: ["/grc20/"], all: ["BalanceOf", "Transfer", "TotalSupply"] },
  nft: { imports: ["/grc721/"], any: ["TokenURI"] },
  defi: { stems: ["swap", "pool", "stake", "vault", "lend"], imports: ["gnoswap", "wugnot"] },
  dao: { stems: ["dao", "govern", "poll"], words: ["gov", "vote"], imports: ["/gov/dao"], any: ["Propose", "Vote"] },
  social: { stems: ["board", "blog", "feed", "guest", "forum", "chat", "social"], words: ["post"], any: ["Post"] },
  markets: { stems: ["bazaar", "market", "auction", "escrow", "bounty", "shop"], all: ["Buy", "List"] },
  identity: {
    stems: ["registry", "directory", "avatar", "profile", "users"],
    words: ["name", "names"],
    imports: ["r/sys/users"],
  },
  ai: { stems: ["agent", "llm"], words: ["ai", "bot"] },
  lab: { stems: ["counter", "hello", "probe", "tally", "demo", "sandbox"], words: ["test", "foo", "bar", "echo"] },
};

interface Reading {
  name: string;
  words: readonly string[];
  functions: readonly string[];
  imports: readonly string[];
}

const CHECKS: readonly ((rule: Rule, reading: Reading) => boolean)[] = [
  (rule, { name }) => rule.stems?.some((stem) => name.includes(stem)) === true,
  (rule, { words }) => rule.words?.some((word) => words.includes(word)) === true,
  (rule, { imports }) => rule.imports?.some((piece) => imports.some((path) => path.includes(piece))) === true,
  (rule, { functions }) => rule.any?.some((fn) => functions.includes(fn)) === true,
  (rule, { functions }) => rule.all?.every((fn) => functions.includes(fn)) === true,
];

/** The styles of a realm, in the order of `STYLES`; none where no rule reads it. */
export function styleOf(realm: Styled): readonly StyleId[] {
  const name = nameOf(realm.path);
  const reading: Reading = {
    name,
    words: name.split(/[^a-z0-9]+/),
    functions: realm.functions,
    imports: realm.imports,
  };
  return STYLES.filter(({ id }) => CHECKS.some((check) => check(RULES[id], reading))).map(({ id }) => id);
}
