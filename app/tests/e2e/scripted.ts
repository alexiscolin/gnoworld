// A scripted Ergo for the screenshots (slice 4): the page's socket answered line by line, so a room's lines, topic
// and people are the same each run, the page being a guest or an account; the rooms come from the real server.
import type { WebSocketRoute } from "@playwright/test";

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

// Each room joined, with #games' topic and names; the history of `told`, #games unless named.
function rooms(
  line: string,
  me: string,
  { history, told, read }: { history: readonly HistoryLine[]; told: string; read: string | undefined },
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
  if (!line.startsWith(`CHATHISTORY LATEST ${told} `)) return [];
  return [
    `BATCH +h1 chathistory ${told}`,
    ...history.map(
      ([id, time, text, author = MEMBER]) =>
        `@batch=h1;msgid=${id};time=${time};account=${author} :${author}!u@h PRIVMSG ${told} :${text}`,
    ),
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

// The page's MARKREAD: Ergo's answer, the later of the place it holds and the one asked (irc/handlers.go:3247,
// v2.19.1); the page's PRIVMSG: Ergo's echo (echo-message), at the time given.
function marking(line: string, places: Map<string, string>, quiet: boolean): string[] {
  const [command, room = "", stamp = ""] = line.split(" ");
  const time = stamp.replace(/^timestamp=/, "");
  if (command !== "MARKREAD" || quiet || time === stamp) return [];
  const held = places.get(room);
  const kept = held !== undefined && held > time ? held : time;
  places.set(room, kept);
  return [`:ergo.test MARKREAD ${room} timestamp=${kept}`];
}

function echoed(line: string, me: string, echo: { time: string | undefined; next: () => number }): string[] {
  const said = /^PRIVMSG (\S+) :(.*)$/s.exec(line);
  if (said === null || echo.time === undefined) return [];
  const [, target = "", text = ""] = said;
  return [`@msgid=echo${String(echo.next())};time=${echo.time};account=${me} :${me}!u@h PRIVMSG ${target} :${text}`];
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
  /** The reading place Ergo gives that room as the page joins it (4f), none unless named. */
  read?: string;
  /** Ergo answers no MARKREAD of the page's, as when the link drops before its answer. */
  quietMarks?: boolean;
  /** Ergo echoes the page's lines, at this time; none unless named. */
  echo?: string;
  /** Ergo answers the page's CHATHISTORY once this settles, so a live line may come before the page (4f's G1). */
  historyAfter?: Promise<void>;
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
    read,
    quietMarks = false,
    echo,
    historyAfter,
  } = Array.isArray(script) ? { history: script } : (script as Scripted);
  const places = new Map<string, string>(read === undefined ? [] : [[room, read]]);
  let echoes = 0;
  ergo.onMessage((data) => {
    const line = String(data);
    heard?.(line);
    const answers = [
      ...welcome(line, me),
      ...rooms(line, me, { history, told: room, read }),
      ...redaction(line, me, refuseRedact),
      ...marking(line, places, quietMarks),
      ...echoed(line, me, { time: echo, next: () => (echoes += 1) }),
    ];
    const reply = () => {
      for (const answer of answers) ergo.send(answer);
    };
    if (historyAfter !== undefined && line.startsWith("CHATHISTORY ")) historyAfter.then(reply, () => undefined);
    else reply();
  });
}
