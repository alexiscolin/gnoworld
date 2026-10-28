// The handshake with Ergo, apart from the connection's life (ergo.ts): what each step of a login by SASL
// takes from Ergo and sends back, the capabilities asked, and what one line a client sends may hold.
import { MULTILINE, type IrcMessage } from "@gnoworld/core";

/** The capabilities the real Ergo grants the server's tests (server/src/testing/ergoKit.ts). */
export const CAPS =
  "message-tags server-time account-tag echo-message batch labeled-response sasl draft/chathistory " +
  "draft/event-playback draft/message-redaction account-notify extended-join multi-prefix draft/metadata-2 standard-replies " +
  "draft/read-marker draft/multiline";
/** The same, asked again of an Ergo that offers no draft/multiline (which NAKs the whole request): its drafts go a
 * line at a time. */
export const BASIC_CAPS = CAPS.replace(` ${MULTILINE}`, "");
const BODY_MAX = 510;
const CHUNK = 400;

// The SASL PLAIN payload: base64 of the UTF-8 of NUL, the account, NUL, the passphrase; then 400-character
// chunks, and a + after a last chunk of exactly 400 (IRCv3 SASL 3.1).
function saslLines(address: string, ticket: string): string[] {
  const bytes = new TextEncoder().encode(`\0${address}\0${ticket}`);
  const payload = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  const lines: string[] = [];
  for (let at = 0; at < payload.length; at += CHUNK) lines.push(`AUTHENTICATE ${payload.slice(at, at + CHUNK)}`);
  if (payload.length % CHUNK === 0) lines.push("AUTHENTICATE +");
  return lines;
}

// One line: no CR, LF or NUL, none empty, 510 UTF-8 bytes at most.
export const oneLine = (line: string): boolean =>
  line !== "" && !/[\0\r\n]/.test(line) && line.isWellFormed() && new TextEncoder().encode(line).length <= BODY_MAX;

// Ergo's answers that end a handshake: SASL's 902 to 907; 433, the nick taken (an account's, by another client);
// 432, a nick Ergo will not take.
export const REFUSALS = new Set(["902", "904", "905", "906", "907", "433", "432"]);

export type Step = "caps" | "sasl" | "auth" | "registering" | "connected";
/** What a line moves: the step after it, the lines to send and, once Ergo answers the capabilities asked, whether
 * draft/multiline is on; or the end of the handshake. */
export type Move = { next: Step; send: readonly string[]; multiline?: boolean } | { end: "fail" | "connected" };
// Who registers: an account, its nick its address, by SASL with its ticket; or a guest, its nick its own and
// no ticket, which needs no sasl (Alexis, 2026-10-25: a visitor reads the public rooms as a guest).
interface Login {
  nick: string;
  ticket: string | undefined;
  /** Whether draft/multiline is still asked: Ergo's NAK of a request holding it asks again without. */
  multiline: boolean;
}
const register = (nick: string): Move => ({
  next: "registering",
  send: ["CAP END", `NICK ${nick}`, `USER u 0 * :${nick}`],
});

// Each step's line, and the move it makes; any other line moves nothing. A NAK fails, but the first of a request
// holding draft/multiline, which asks again without it; so does an account's ACK without sasl.
const STEPS: Record<Exclude<Step, "connected">, (message: IrcMessage, login: Login) => Move | undefined> = {
  caps: ({ command, params }, { nick, ticket, multiline }) => {
    const sub = params[1];
    if (command !== "CAP" || (sub !== "ACK" && sub !== "NAK")) return undefined;
    const granted = (params.at(-1) ?? "").split(" ");
    if (sub === "NAK") {
      return multiline && granted.includes(MULTILINE)
        ? { next: "caps", send: [`CAP REQ :${BASIC_CAPS}`], multiline: false }
        : { end: "fail" };
    }
    const on = granted.includes(MULTILINE);
    if (ticket === undefined) return { ...register(nick), multiline: on };
    return granted.includes("sasl") ? { next: "sasl", send: ["AUTHENTICATE PLAIN"], multiline: on } : { end: "fail" };
  },
  sasl: ({ command, params }, { nick, ticket }) =>
    command === "AUTHENTICATE" && params[0] === "+" && ticket !== undefined
      ? { next: "auth", send: saslLines(nick, ticket) }
      : undefined,
  auth: ({ command }, { nick }) => (command === "903" ? register(nick) : undefined),
  registering: ({ command }) => (command === "376" || command === "422" ? { end: "connected" } : undefined),
};

/** The move a line from Ergo makes at a step of the handshake: undefined when it moves nothing. */
export const advance = (step: Exclude<Step, "connected">, message: IrcMessage, login: Login): Move | undefined =>
  STEPS[step](message, login);

/** A guest's nicks Ergo may refuse as taken before it gives up for this connection. */
export const GUEST_TRIES = 8;

// A guest's nick: one word of letters, digits and hyphens, a letter first, 32 at most (Ergo's NICKLEN for a
// guest, server/src/testing/ergo.test.ts:314), so no line it is sent in breaks and no address fits.
const GUEST_NICK = /^[A-Za-z][A-Za-z0-9-]{0,31}$/;

/** The nick a guest draws, or undefined when the draw throws or gives one no line may carry. */
export function guestNick(draw: () => string): string | undefined {
  try {
    const nick = draw();
    return GUEST_NICK.test(nick) ? nick : undefined;
  } catch {
    return undefined;
  }
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789";
/** A guest's nick: guest- and six of LETTERS from the browser's randomness, an unbiased draw (a byte past
 * 251 drawn again), never a name an address could be taken for. */
export function drawGuestNick(): string {
  let nick = "guest-";
  while (nick.length < 12) {
    const [byte = 255] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < 252) nick += LETTERS.charAt(byte % 36);
  }
  return nick;
}
