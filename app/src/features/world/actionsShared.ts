// What the computer's actions and the phone's (PhoneActions.tsx) have in common: the words of the main action, what makes a path a link,
// and whether anyone has said hi yet.
import { useApp } from "../../storeContext.tsx";
import type { ActionsProps } from "./Actions.tsx";

// A path of this site, made of plain segments and nothing else: a value from a world's data is untrusted, so a scheme, a host,
// a backslash, a space, a control character, a dot segment, a query or a fragment is no link (the browser reads `/\\host` and
// `/<tab>/host` as another host).
const isSitePath = (path: string): boolean => /^(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)+$/.test(path);

// Whether the room's history came and holds nobody's words, only notices: nobody has said hi yet. False while the chat has not shown it.
const useNobodySpoke = (room: string | undefined) =>
  useApp(({ chat }) => {
    const held = room === undefined ? undefined : chat.rooms[room];
    return held?.paged === true && held.lines.every(({ kind }) => kind === "notice");
  });

/** The main action when no proposals lead: the place's own lead, else the chat's anchor, asking to be the first once nobody has said hi. */
function useMain({
  room,
  lead,
  say,
}: {
  room: string | undefined;
  lead: ActionsProps["lead"] | undefined;
  say: string | undefined;
}): NonNullable<ActionsProps["lead"]> {
  const first = useNobodySpoke(room);
  return (
    lead ?? {
      label: first ? "Be the first to say hi" : (say ?? "Say hi in the chat"),
      href: "#chat",
      icon: "chat" as const,
    }
  );
}

/** What both rows lead with: the main action, and the proposals' path when it is one of this site's, which then leads. */
export function useLeads({ proposals, say, room, lead }: Pick<ActionsProps, "proposals" | "say" | "room" | "lead">) {
  const main = useMain({ room, lead, say });
  return { main, proposals: proposals !== undefined && isSitePath(proposals) ? proposals : undefined };
}
