// A scripted Ergo for the screenshots (slice 4): the page's socket answered line by line, so a room's lines, topic
// and people are the same each run, the page being a guest or an account; the rooms come from the real server.
import type { WebSocketRoute } from "@playwright/test";

export const MEMBER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
export type HistoryLine = readonly [id: string, time: string, text: string];
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

// Each room joined, with #games' topic and names; #games' history.
function rooms(line: string, me: string, history: readonly HistoryLine[]): string[] {
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
  if (!line.startsWith("CHATHISTORY LATEST #bubble/games ")) return [];
  return [
    "BATCH +h1 chathistory #bubble/games",
    ...history.map(
      ([id, time, text]) =>
        `@batch=h1;msgid=${id};time=${time};account=${MEMBER} :${MEMBER}!u@h PRIVMSG #bubble/games :${text}`,
    ),
    "BATCH -h1",
  ];
}

/** Answers the page's socket as Ergo would, the page being `me`. */
export function scriptedErgo(ergo: WebSocketRoute, me: string, history: readonly HistoryLine[] = LINES): void {
  ergo.onMessage((data) => {
    const line = String(data);
    for (const answer of [...welcome(line, me), ...rooms(line, me, history)]) ergo.send(answer);
  });
}
