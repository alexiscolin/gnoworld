// A scripted Ergo for the screenshots (slice 4): the page's socket answered line by line, so a room's lines, topic
// and people are the same each run, the page being a guest or an account; the rooms come from the real server.
import { echoedLines, several, type Open } from "./severalLines.ts";
import type { WebSocketRoute } from "@playwright/test";
import { hydrated, type Page } from "./fixtures.ts";
import { echoed, marking, redaction, refusedReaction, refusedSay, tagged } from "./scriptedAnswers.ts";

export const MEMBER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
/** A line of #games' history; its author MEMBER unless named. */
export type HistoryLine = readonly [id: string, time: string, text: string, author?: string];
const LINES: readonly HistoryLine[] = [
  ["a1", "2026-10-25T10:00:00.000Z", "Welcome to the games room."],
  ["a2", "2026-10-25T10:01:00.000Z", "Who is up for a round of **gnogolf**? Rules: https://gno.land/r/demo"],
];

// Ergo's half of the handshake, as `me`: the ACK, SASL's yes to an account, the welcome.
function welcome(line: string, me: string, noMultiline: boolean): string[] {
  if (line.startsWith("CAP REQ :")) {
    const refused = noMultiline && line.includes("draft/multiline");
    return [`:ergo CAP * ${refused ? "NAK" : "ACK"} :${line.slice("CAP REQ :".length)}`];
  }
  if (line === "AUTHENTICATE PLAIN") return ["AUTHENTICATE +"];
  if (line.startsWith("AUTHENTICATE ")) return [`:ergo 903 * :SASL authentication successful`];
  if (line.startsWith("USER ")) return [`:ergo 001 ${me} :Welcome`, `:ergo 376 ${me} :End of MOTD`];
  return [];
}

// A history batch of `lines` in `room`, Ergo's.
const page = (id: string, lines: readonly HistoryLine[], room: string): string[] => [
  `BATCH +${id} chathistory ${room}`,
  ...lines.map(
    ([msgid, time, text, author = MEMBER]) =>
      `@batch=${id};msgid=${msgid};time=${time};account=${author} :${author}!u@h PRIVMSG ${room} :${text}`,
  ),
  `BATCH -${id}`,
];

// A raw line in the history batch: its batch tag first among its own.
const batched = (raw: string): string => (raw.startsWith("@") ? `@batch=h1;${raw.slice(1)}` : `@batch=h1 ${raw}`);

// The history Ergo gives for a room asked, if the script holds one: `held` is by room.
const historyOf = (held: Readonly<Record<string, readonly HistoryLine[]>>, asked: string) =>
  Object.hasOwn(held, asked) ? held[asked] : undefined;

// Each room joined, with #games' topic and names; the history of `told`, #games unless named, its raw lines last.
function rooms(
  line: string,
  me: string,
  {
    history,
    replayed,
    older,
    told,
    read,
    others,
  }: {
    history: readonly HistoryLine[];
    replayed: readonly string[];
    older: readonly HistoryLine[];
    told: string;
    read: string | undefined;
    others?: Readonly<Record<string, readonly HistoryLine[]>> | undefined;
  },
): string[] {
  if (line.startsWith("JOIN ")) {
    return line
      .slice("JOIN ".length)
      .split(",")
      .flatMap((room) => [
        `:${me}!u@h JOIN ${room}`,
        ...(room === "#bubble/games" ? [`:ergo 332 ${me} ${room} :Games played on chain, and their players.`] : []),
        `:ergo 353 ${me} = ${room} :@gnoworld ${MEMBER} ${me}`,
        // Ergo tells the reading place before the end of NAMES (draft/read-marker).
        ...(room === told && read !== undefined ? [`:ergo MARKREAD ${room} timestamp=${read}`] : []),
        `:ergo 366 ${me} ${room} :End of /NAMES list.`,
      ]);
  }
  if (line.startsWith(`CHATHISTORY BEFORE ${told} `)) return page("h2", older, told);
  const asked = /^CHATHISTORY LATEST (\S+) /.exec(line)?.[1] ?? "";
  const held = historyOf({ ...others, [told]: history }, asked);
  if (held === undefined) return [];
  return [
    `BATCH +h1 chathistory ${asked}`,
    ...held.flatMap(([id, time, text, author = MEMBER]) => {
      const stamp = `msgid=${id};time=${time};account=${author}`;
      if (!text.includes("\n")) return [`@batch=h1;${stamp} :${author}!u@h PRIVMSG ${asked} :${text}`];
      // A message of several lines sits in the page as a draft/multiline batch of its own (draft/multiline).
      return several(`@batch=h1;${stamp} :${author}!u@h`, { ref: `m${id}`, room: asked, parts: text.split("\n") });
    }),
    ...replayed.map(batched),
    "BATCH -h1",
  ];
}

export interface Scripted {
  /** #games' history, or the named room's. */
  history?: readonly HistoryLine[];
  /** Each line the page sends, as it sends it. */
  heard?: (line: string) => void;
  /** Ergo refuses every REDACT. */
  refuseRedact?: boolean;
  /** Ergo answers no REDACT: the test says its echo on the socket, when it chooses. */
  holdRedact?: boolean;
  /** The room whose history it holds, #games unless named. */
  room?: string;
  /** The history of other rooms, by room: the page asks it as it opens one (4f-n). */
  others?: Readonly<Record<string, readonly HistoryLine[]>>;
  /** The reading place Ergo gives that room as the page joins it (4f), none unless named. */
  read?: string;
  /** Ergo answers no MARKREAD of the page's, as when the link drops before its answer. */
  quietMarks?: boolean;
  /** Ergo echoes the page's lines (echo-message), at this time, or true for one after the history's; none unless named. */
  echo?: string | true;
  /** Ergo answers the page's CHATHISTORY once this settles, so a live line may come before the page (4f's G1). */
  historyAfter?: Promise<void>;
  /** Lines Ergo replays after the history's, as it sends them: a reaction's TAGMSG, a reply or an edit. */
  replayed?: readonly string[];
  /** Ergo refuses each PRIVMSG that carries a tag of the page's (a reply or an edit) as to a nick not connected: a 401 to
   * its label, no echo; a line with no tag goes through. */
  refuseTagged?: boolean;
  /** Ergo refuses each reaction, as in a room the account may not speak in: a 404 to its label, no echo. */
  refuseReact?: boolean;
  /** Ergo welcomes the page (001) once this settles: the connection starts late, its nick not known yet. */
  welcomeAfter?: Promise<void>;
  /** Ergo does not offer draft/multiline: it NAKs the request holding it, and ACKs the one without. */
  noMultiline?: boolean;
  /** The lines before the history's, which Ergo gives to CHATHISTORY BEFORE. */
  older?: readonly HistoryLine[];
}

// The reading places Ergo holds: the room's, when one is given.
const placesOf = (room: string, read: string | undefined) =>
  new Map<string, string>(read === undefined ? [] : [[room, read]]);

/** Answers the page's socket as Ergo would, the page being `me`: with #games' history, or with what `script` says. */
export function scriptedErgo(ergo: WebSocketRoute, me: string, script: Scripted = {}): void {
  const {
    history = LINES,
    heard,
    refuseRedact = false,
    holdRedact = false,
    room = "#bubble/games",
    read,
    quietMarks = false,
    echo,
    historyAfter,
    replayed = [],
    refuseReact = false,
    refuseTagged,
    older = [],
  } = script;
  const places = placesOf(room, read);
  let echoes = 0;
  const multiline: Open = new Map();
  ergo.onMessage((data) => {
    const line = String(data);
    heard?.(line);
    const answers = [
      ...welcome(line, me, script.noMultiline === true),
      ...rooms(line, me, { history, replayed, older, told: room, read, others: script.others }),
      ...redaction(line, me, { refuse: refuseRedact, hold: holdRedact }),
      ...echoedLines(line, me, multiline),
      ...marking(line, places, quietMarks),
      ...refusedReaction(line, me, refuseReact),
      ...refusedSay(line, me, tagged(line, refuseTagged)),
      ...echoed(line, me, {
        time: echo,
        refused: refuseReact,
        saying: !tagged(line, refuseTagged),
        next: () => (echoes += 1),
      }),
    ];
    const reply = () => {
      for (const answer of answers) ergo.send(answer);
    };
    const after = line.startsWith("CHATHISTORY ")
      ? historyAfter
      : line.startsWith("USER ")
        ? script.welcomeAfter
        : undefined;
    if (after !== undefined) after.then(reply, () => undefined);
    else reply();
  });
}

/** #games, or the room `script` names, opened on a scripted Ergo as `me`; the socket, to say a live line on it. */
export async function opened(page: Page, me: string, script: Scripted = {}): Promise<() => WebSocketRoute> {
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    socket = ergo;
    scriptedErgo(ergo, me, script);
  });
  await page.goto(`/w/bubble${script.room === "#bubble" ? "" : "?room=games"}`);
  await hydrated(page);
  return () => {
    if (socket === undefined) throw new Error("the page opened no socket");
    return socket;
  };
}
