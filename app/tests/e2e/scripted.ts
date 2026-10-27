// A scripted Ergo for the screenshots (slice 4): the page's socket answered line by line, so a room's lines, topic
// and people are the same each run, the page being a guest or an account; the rooms come from the real server.
import { echoedLines, several, type Open } from "./severalLines.ts";
import type { WebSocketRoute } from "@playwright/test";
import { hydrated, type Page } from "./fixtures.ts";

export const MEMBER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
/** A line of #games' history; its author MEMBER unless named. */
export type HistoryLine = readonly [id: string, time: string, text: string, author?: string];
const LINES: readonly HistoryLine[] = [
  ["a1", "2026-10-25T10:00:00.000Z", "Welcome to the games room."],
  ["a2", "2026-10-25T10:01:00.000Z", "Who is up for a round of **gnogolf**? Rules: https://gno.land/r/demo"],
];

// Ergo's half of the handshake, as `me`: the ACK, SASL's yes to an account, the welcome.
function welcome(line: string, me: string): string[] {
  if (line.startsWith("CAP REQ :")) return [`:ergo CAP * ACK :${line.slice("CAP REQ :".length)}`];
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
  }: {
    history: readonly HistoryLine[];
    replayed: readonly string[];
    older: readonly HistoryLine[];
    told: string;
    read: string | undefined;
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
  if (!line.startsWith(`CHATHISTORY LATEST ${told} `)) return [];
  return [
    `BATCH +h1 chathistory ${told}`,
    ...history.flatMap(([id, time, text, author = MEMBER]) => {
      const stamp = `msgid=${id};time=${time};account=${author}`;
      if (!text.includes("\n")) return [`@batch=h1;${stamp} :${author}!u@h PRIVMSG ${told} :${text}`];
      // A message of several lines sits in the page as a draft/multiline batch of its own (draft/multiline).
      return several(`@batch=h1;${stamp} :${author}!u@h`, { ref: `m${id}`, room: told, parts: text.split("\n") });
    }),
    ...replayed.map(batched),
    "BATCH -h1",
  ];
}

// A REDACT of the page's: Ergo's echo, which takes the line from every reader, or its refusal; none while held.
function redaction(line: string, me: string, { refuse, hold }: { refuse: boolean; hold: boolean }): string[] {
  const [command, room = "", id = ""] = line.split(" ");
  if (command !== "REDACT" || hold) return [];
  if (refuse)
    return [`:ergo FAIL REDACT REDACT_FORBIDDEN ${room} ${id} :You are not authorised to delete this message`];
  return [`:${me}!u@h REDACT ${room} ${id}`];
}

// The page's MARKREAD: Ergo's answer, the later of the place it holds and the one asked (irc/handlers.go:3247,
// v2.19.1).
function marking(line: string, places: Map<string, string>, quiet: boolean): string[] {
  const [command, room = "", stamp = ""] = line.split(" ");
  const time = stamp.replace(/^timestamp=/, "");
  if (command !== "MARKREAD" || quiet) return [];
  // The ask of the place it holds (handlers.go:3229-3233, v2.19.1): `*` for none.
  const asked = places.get(room);
  if (stamp === "") return [`:ergo.test MARKREAD ${room} ${asked === undefined ? "*" : `timestamp=${asked}`}`];
  if (time === stamp) return [];
  const held = places.get(room);
  const kept = held !== undefined && held > time ? held : time;
  places.set(room, kept);
  return [`:ergo.test MARKREAD ${room} timestamp=${kept}`];
}

// The page's line: its tags, then the rest.
function split(line: string): { tags: string; rest: string } {
  if (!line.startsWith("@")) return { tags: "", rest: line };
  const space = line.indexOf(" ");
  return { tags: line.slice(1, space), rest: line.slice(space + 1) };
}

// Ergo's refusal of a TAGMSG in a room the account may not speak in: a 404, labelled as the TAGMSG was.
function refusedReaction(line: string, me: string, refuse: boolean): string[] {
  const { tags, rest } = split(line);
  const [command, room = ""] = rest.split(" ");
  if (command !== "TAGMSG" || !refuse) return [];
  const label = /(?:^|;)label=([^;]*)/.exec(tags)?.[1];
  return [`${label === undefined ? "" : `@label=${label} `}:ergo 404 ${me} ${room} :Cannot send to channel (+m)`];
}

// Ergo's echo (echo-message) of a PRIVMSG the page sends, or of a reaction's TAGMSG, under `me`, with a msgid and a
// time: the one given, or one after the history's, the page's own tags kept. A typing TAGMSG is not echoed, nor a
// reaction Ergo refused.
function echoed(
  line: string,
  me: string,
  echo: { time: string | true | undefined; refused: boolean; next: () => number },
): string[] {
  const { tags, rest } = split(line);
  const reaction = rest.startsWith("TAGMSG ") && !echo.refused && /\+draft\/(un)?react=/.test(tags);
  // A line of a message of several lines is echoed with the batch (echoedLines), not one by one.
  const single = rest.startsWith("PRIVMSG ") && !/(?:^|;)batch=/.test(tags);
  if (echo.time === undefined || !(single || reaction)) return [];
  const count = echo.next();
  const time =
    echo.time === true ? new Date(Date.parse("2026-10-25T11:00:00.000Z") + count * 1000).toISOString() : echo.time;
  return [`@msgid=echo${String(count)};time=${time};account=${me}${tags === "" ? "" : `;${tags}`} :${me}!u@h ${rest}`];
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
  /** Ergo refuses each reaction, as in a room the account may not speak in: a 404 to its label, no echo. */
  refuseReact?: boolean;
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
    older = [],
  } = script;
  const places = placesOf(room, read);
  let echoes = 0;
  const multiline: Open = new Map();
  ergo.onMessage((data) => {
    const line = String(data);
    heard?.(line);
    const answers = [
      ...welcome(line, me),
      ...rooms(line, me, { history, replayed, older, told: room, read }),
      ...redaction(line, me, { refuse: refuseRedact, hold: holdRedact }),
      ...echoedLines(line, me, multiline),
      ...marking(line, places, quietMarks),
      ...refusedReaction(line, me, refuseReact),
      ...echoed(line, me, { time: echo, refused: refuseReact, next: () => (echoes += 1) }),
    ];
    const reply = () => {
      for (const answer of answers) ergo.send(answer);
    };
    if (historyAfter !== undefined && line.startsWith("CHATHISTORY ")) historyAfter.then(reply, () => undefined);
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
