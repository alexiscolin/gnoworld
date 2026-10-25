// The handshake with Ergo, apart from the connection's life (ergo.ts): what each step of a login by SASL
// takes from Ergo and sends back, the capabilities asked, and what one line a client sends may hold.
import type { IrcMessage } from "@gnoworld/core";

/** The capabilities the real Ergo grants the server's tests (server/src/testing/ergoKit.ts). */
export const CAPS =
  "message-tags server-time account-tag echo-message batch labeled-response sasl draft/chathistory " +
  "draft/event-playback draft/message-redaction account-notify extended-join multi-prefix draft/metadata-2 standard-replies";
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

// Ergo's answers that end a handshake: SASL's 902 to 907, and 433, the nick (an address) taken by another client.
export const REFUSALS = new Set(["902", "904", "905", "906", "907", "433"]);

export type Step = "caps" | "sasl" | "auth" | "registering" | "connected";
/** What a line moves: the step after it and the lines to send, or the end of the handshake. */
export type Move = { next: Step; send: readonly string[] } | { end: "fail" | "connected" };
interface Login {
  address: string;
  ticket: string;
}

// Each step's line, and the move it makes; any other line moves nothing. A NAK, or an ACK without sasl, fails.
const STEPS: Record<Exclude<Step, "connected">, (message: IrcMessage, login: Login) => Move | undefined> = {
  caps: ({ command, params }) => {
    const sub = params[1];
    if (command !== "CAP" || (sub !== "ACK" && sub !== "NAK")) return undefined;
    const granted = sub === "ACK" && (params.at(-1) ?? "").split(" ").includes("sasl");
    return granted ? { next: "sasl", send: ["AUTHENTICATE PLAIN"] } : { end: "fail" };
  },
  sasl: ({ command, params }, { address, ticket }) =>
    command === "AUTHENTICATE" && params[0] === "+" ? { next: "auth", send: saslLines(address, ticket) } : undefined,
  auth: ({ command }, { address }) =>
    command === "903"
      ? { next: "registering", send: ["CAP END", `NICK ${address}`, `USER u 0 * :${address}`] }
      : undefined,
  registering: ({ command }) => (command === "376" || command === "422" ? { end: "connected" } : undefined),
};

/** The move a line from Ergo makes at a step of the handshake: undefined when it moves nothing. */
export const advance = (step: Exclude<Step, "connected">, message: IrcMessage, login: Login): Move | undefined =>
  STEPS[step](message, login);
