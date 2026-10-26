// A scripted Ergo for the screenshots (slice 4): the page's socket answered line by line, so a room's lines, topic
// and people are the same each run, the page being a guest or an account; the rooms come from the real server.
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

// A raw line in the history batch: its batch tag first among its own.
const batched = (raw: string): string => (raw.startsWith("@") ? `@batch=h1;${raw.slice(1)}` : `@batch=h1 ${raw}`);

// Each room joined, with #games' topic and names; the history of `told`, #games unless named, its raw lines last.
function rooms(
  line: string,
  me: string,
  { history, replayed, told }: { history: readonly HistoryLine[]; replayed: readonly string[]; told: string },
): string[] {
  if (line.startsWith("JOIN ")) {
    return line
      .slice("JOIN ".length)
      .split(",")
      .flatMap((room) => [
        `:${me}!u@h JOIN ${room}`,
        ...(room === "#bubble/games" ? [`:ergo 332 ${me} ${room} :Games played on chain, and their players.`] : []),
        `:ergo 353 ${me} = ${room} :@gnoworld ${MEMBER} ${me}`,
        `:ergo 366 ${me} ${room} :End of /NAMES list.`,
      ]);
  }
  if (!line.startsWith(`CHATHISTORY LATEST ${told} `)) return [];
  return [
    `BATCH +h1 chathistory ${told}`,
    ...history.map(
      ([id, time, text, author = MEMBER]) =>
        `@batch=h1;msgid=${id};time=${time};account=${author} :${author}!u@h PRIVMSG ${told} :${text}`,
    ),
    ...replayed.map(batched),
    "BATCH -h1",
  ];
}

// A REDACT of the page's: Ergo's echo, which takes the line from every reader, or its refusal.
function redaction(line: string, me: string, refuse: boolean): string[] {
  const [command, room = "", id = ""] = line.split(" ");
  if (command !== "REDACT") return [];
  if (refuse)
    return [`:ergo FAIL REDACT REDACT_FORBIDDEN ${room} ${id} :You are not authorised to delete this message`];
  return [`:${me}!u@h REDACT ${room} ${id}`];
}

// The page's line: its tags, then the rest.
function split(line: string): { tags: string; rest: string } {
  if (!line.startsWith("@")) return { tags: "", rest: line };
  const space = line.indexOf(" ");
  return { tags: line.slice(1, space), rest: line.slice(space + 1) };
}

// Ergo's refusal of a TAGMSG in a room the account may not speak in: a 404, labelled as the TAGMSG was.
function refusedReaction(line: string, me: string): string[] {
  const { tags, rest } = split(line);
  const [command, room = ""] = rest.split(" ");
  if (command !== "TAGMSG") return [];
  const label = /(?:^|;)label=([^;]*)/.exec(tags)?.[1];
  return [`${label === undefined ? "" : `@label=${label} `}:ergo 404 ${me} ${room} :Cannot send to channel (+m)`];
}

// Ergo's echo of a PRIVMSG or a TAGMSG the page sends (echo-message): under `me`, with a msgid and a time after the
// history's, the page's own tags kept.
function echoed(line: string, me: string, count: number): string[] {
  const { tags, rest } = split(line);
  if (!/^(PRIVMSG|TAGMSG) /.test(rest)) return [];
  const time = new Date(Date.parse("2026-10-25T11:00:00.000Z") + count * 1000).toISOString();
  return [`@msgid=echo${String(count)};time=${time};account=${me}${tags === "" ? "" : `;${tags}`} :${me}!u@h ${rest}`];
}

export interface Scripted {
  /** #games' history, or the named room's. */
  history?: readonly HistoryLine[];
  /** Each line the page sends, as it sends it. */
  heard?: (line: string) => void;
  /** Ergo refuses every REDACT. */
  refuseRedact?: boolean;
  /** The room whose history it holds, #games unless named. */
  room?: string;
  /** Lines Ergo replays after the history's, as it sends them: a reaction's TAGMSG, a reply or an edit. */
  replayed?: readonly string[];
  /** Ergo echoes what the page says (echo-message). */
  echo?: boolean;
  /** Ergo refuses each reaction, as in a room the account may not speak in: a 404 to its label, no echo. */
  refuseReact?: boolean;
}

/** Answers the page's socket as Ergo would, the page being `me`: with #games' history, or with what `script` says. */
export function scriptedErgo(
  ergo: WebSocketRoute,
  me: string,
  script: readonly HistoryLine[] | Scripted = LINES,
): void {
  const {
    history = LINES,
    heard,
    refuseRedact = false,
    room = "#bubble/games",
    replayed = [],
    echo = false,
    refuseReact = false,
  } = Array.isArray(script) ? { history: script } : (script as Scripted);
  let echoes = 0;
  ergo.onMessage((data) => {
    const line = String(data);
    heard?.(line);
    const answers = [
      ...welcome(line, me),
      ...rooms(line, me, { history, replayed, told: room }),
      ...redaction(line, me, refuseRedact),
      ...(refuseReact ? refusedReaction(line, me) : []),
      ...(echo && !(refuseReact && line.includes(" TAGMSG ")) ? echoed(line, me, (echoes += 1)) : []),
    ];
    for (const answer of answers) ergo.send(answer);
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
