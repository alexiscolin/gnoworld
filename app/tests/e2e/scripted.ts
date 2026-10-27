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
  { history, told }: { history: readonly HistoryLine[]; told: string },
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
    ...history.flatMap(([id, time, text, author = MEMBER]) => {
      const stamp = `msgid=${id};time=${time};account=${author}`;
      if (!text.includes("\n")) return [`@batch=h1;${stamp} :${author}!u@h PRIVMSG ${told} :${text}`];
      // A message of several lines sits in the page as a draft/multiline batch of its own (draft/multiline).
      return several(`@batch=h1;${stamp} :${author}!u@h`, { ref: `m${id}`, room: told, parts: text.split("\n") });
    }),
    "BATCH -h1",
  ];
}

// A message of several lines as Ergo relays it to a reader with draft/multiline: the opening line (its tags and
// source given), each part a PRIVMSG of the batch, the end tagged as the opening is, the room and the reference
// after a colon as Ergo writes them (irc/client.go, composeMultilineBatch, v2.19.1).
function several(opening: string, { ref, room, parts }: { ref: string; room: string; parts: readonly string[] }) {
  const [tags, source] = opening.split(" ");
  const within = /(?:^@|;)(batch=[^;]+)/.exec(tags ?? "")?.[1];
  return [
    `${opening} BATCH +${ref} draft/multiline :${room}`,
    ...parts.map((part) => `@batch=${ref} ${source ?? ""} PRIVMSG ${room} :${part}`),
    `${within === undefined ? "" : `@${within} `}${source ?? ""} BATCH :-${ref}`,
  ];
}

type Open = Map<string, { room: string; parts: string[] }>;

// The page's lines of a batch of several lines, held by its reference until its end; whether the line was one.
function held(line: string, open: Open): boolean {
  const opened = /^BATCH \+(\S+) draft\/multiline (\S+)$/.exec(line);
  if (opened?.[1] !== undefined && opened[2] !== undefined) {
    open.set(opened[1], { room: opened[2], parts: [] });
    return true;
  }
  const part = /^@batch=(\S+) PRIVMSG \S+ :(.*)$/.exec(line);
  if (part?.[1] !== undefined) open.get(part[1])?.parts.push(part[2] ?? "");
  return part !== null;
}

// The page's own message of several lines, echoed as Ergo echoes it once the page's batch ends (echo-message), its
// id and time made here.
function echoed(line: string, me: string, open: Open): string[] {
  if (held(line, open)) return [];
  const ref = /^BATCH -(\S+)$/.exec(line)?.[1];
  const batch = ref === undefined ? undefined : open.get(ref);
  if (ref === undefined || batch === undefined) return [];
  open.delete(ref);
  const stamp = `msgid=echo-${ref};time=${new Date().toISOString()};account=${me}`;
  return several(`@${stamp} :${me}!u@h`, { ref: `e${ref}`, room: batch.room, parts: batch.parts });
}

// A REDACT of the page's: Ergo's echo, which takes the line from every reader, or its refusal; none while held.
function redaction(line: string, me: string, { refuse, hold }: { refuse: boolean; hold: boolean }): string[] {
  const [command, room = "", id = ""] = line.split(" ");
  if (command !== "REDACT" || hold) return [];
  if (refuse)
    return [`:ergo FAIL REDACT REDACT_FORBIDDEN ${room} ${id} :You are not authorised to delete this message`];
  return [`:${me}!u@h REDACT ${room} ${id}`];
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
}

/** Answers the page's socket as Ergo would, the page being `me`: with #games' history, or with what `script` says. */
export function scriptedErgo(ergo: WebSocketRoute, me: string, script: Scripted = {}): void {
  const { history = LINES, heard, refuseRedact = false, holdRedact = false, room = "#bubble/games" } = script;
  const multiline: Open = new Map();
  ergo.onMessage((data) => {
    const line = String(data);
    heard?.(line);
    const answers = [
      ...welcome(line, me),
      ...rooms(line, me, { history, told: room }),
      ...redaction(line, me, { refuse: refuseRedact, hold: holdRedact }),
      ...echoed(line, me, multiline),
    ];
    for (const answer of answers) ergo.send(answer);
  });
}
