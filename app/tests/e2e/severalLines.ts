// The scripted Ergo's lines for a message of several lines (draft/multiline), apart from scripted.ts.
// A message of several lines as Ergo relays it to a reader with draft/multiline: the opening line (its tags and
// source given), each part a PRIVMSG of the batch, the end tagged as the opening is, the room and the reference
// after a colon as Ergo writes them (irc/client.go, composeMultilineBatch, v2.19.1).
export function several(
  opening: string,
  { ref, room, parts }: { ref: string; room: string; parts: readonly string[] },
) {
  const [tags, source] = opening.split(" ");
  const within = /(?:^@|;)(batch=[^;]+)/.exec(tags ?? "")?.[1];
  return [
    `${opening} BATCH +${ref} draft/multiline :${room}`,
    ...parts.map((part) => `@batch=${ref} ${source ?? ""} PRIVMSG ${room} :${part}`),
    `${within === undefined ? "" : `@${within} `}${source ?? ""} BATCH :-${ref}`,
  ];
}

export type Open = Map<string, { room: string; parts: string[] }>;

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
export function echoedLines(line: string, me: string, open: Open): string[] {
  if (held(line, open)) return [];
  const ref = /^BATCH -(\S+)$/.exec(line)?.[1];
  const batch = ref === undefined ? undefined : open.get(ref);
  if (ref === undefined || batch === undefined) return [];
  open.delete(ref);
  const stamp = `msgid=echo-${ref};time=${new Date().toISOString()};account=${me}`;
  return several(`@${stamp} :${me}!u@h`, { ref: `e${ref}`, room: batch.room, parts: batch.parts });
}
