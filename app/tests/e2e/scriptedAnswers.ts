// What the scripted Ergo (scripted.ts) answers of what the page sends, one answer for each kind of line: a REDACT, a
// MARKREAD, a refused TAGMSG or PRIVMSG, and the echo of a line the page said.

// A REDACT of the page's: Ergo's echo, which takes the line from every reader, or its refusal; none while held.
export function redaction(line: string, me: string, { refuse, hold }: { refuse: boolean; hold: boolean }): string[] {
  const { tags, rest } = split(line);
  const [command, room = "", id = ""] = rest.split(" ");
  if (command !== "REDACT" || hold) return [];
  // Ergo's answer carries the label of the command it answers (labeled-response), a direct message's delete having one.
  const label = /(?:^|;)label=([^;]*)/.exec(tags)?.[1];
  if (refuse)
    return [
      `${label === undefined ? "" : `@label=${label} `}:ergo FAIL REDACT REDACT_FORBIDDEN ${room} ${id} :You are not authorised to delete this message`,
    ];
  return [`:${me}!u@h REDACT ${room} ${id}`];
}

// The page's MARKREAD: Ergo's answer, the later of the place it holds and the one asked (irc/handlers.go:3247,
// v2.19.1).
export function marking(line: string, places: Map<string, string>, quiet: boolean): string[] {
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
export function refusedReaction(line: string, me: string, refuse: boolean): string[] {
  const { tags, rest } = split(line);
  const [command, room = ""] = rest.split(" ");
  if (command !== "TAGMSG" || !refuse) return [];
  const label = /(?:^|;)label=([^;]*)/.exec(tags)?.[1];
  return [`${label === undefined ? "" : `@label=${label} `}:ergo 404 ${me} ${room} :Cannot send to channel (+m)`];
}

// Ergo's refusal of a PRIVMSG to a nick that is not connected: a 401, labelled as the PRIVMSG was, its partner named.
export function refusedSay(line: string, me: string, refuse: boolean): string[] {
  const { tags, rest } = split(line);
  const [command, to = ""] = rest.split(" ");
  if (command !== "PRIVMSG" || !refuse) return [];
  const label = /(?:^|;)label=([^;]*)/.exec(tags)?.[1];
  return [`${label === undefined ? "" : `@label=${label} `}:ergo 401 ${me} ${to} :No such nick`];
}

// Ergo's echo (echo-message) of a PRIVMSG the page sends, or of a reaction's TAGMSG, under `me`, with a msgid and a
// time: the one given, or one after the history's, the page's own tags kept. A typing TAGMSG is not echoed, nor a
// reaction Ergo refused.
export function echoed(
  line: string,
  me: string,
  echo: { time: string | true | undefined; refused: boolean; next: () => number; saying?: boolean },
): string[] {
  const { tags, rest } = split(line);
  const reaction = rest.startsWith("TAGMSG ") && !echo.refused && /\+draft\/(un)?react=/.test(tags);
  // A line of a message of several lines is echoed with the batch (echoedLines), not one by one.
  const single = rest.startsWith("PRIVMSG ") && !/(?:^|;)batch=/.test(tags);
  if (echo.time === undefined || !((single && echo.saying !== false) || reaction)) return [];
  const count = echo.next();
  const time =
    echo.time === true ? new Date(Date.parse("2026-10-25T11:00:00.000Z") + count * 1000).toISOString() : echo.time;
  return [`@msgid=echo${String(count)};time=${time};account=${me}${tags === "" ? "" : `;${tags}`} :${me}!u@h ${rest}`];
}

// Whether `refuse` and the page's line carries a tag of ours, a reply or an edit.
export const tagged = (line: string, refuse: boolean | undefined) =>
  refuse === true && /^@[^ ]*\+(reply|gnoworld\/edit)=/.test(line);
