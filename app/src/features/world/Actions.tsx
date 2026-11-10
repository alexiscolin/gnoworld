// A place's actions (frames 26, 86, 93): the main one, then Follow and Share as the video draws them, with the plate at its first paint
// (Alexis, 2026-11-04: "Tout de suite, jusqu'à +512 o"); the share sheet's code comes at the first press.
import { Button, Cluster, IconButton, type IconName } from "@gnoworld/ui";
import { useEffect } from "react";
import { useApp } from "../../storeContext.tsx";
import { FollowButton } from "../follow/index.ts";
import { sharePlace, type SharedPlace } from "../share/index.ts";

// The link goes to the chat; the focus follows it to the composer, so the reader can type at once (F2864). The composer is the
// chat's own textarea: the jump to a fragment would blur it, so when there is one the click stops there. With none (the rooms have
// not loaded, or a guest reads), the link keeps its jump.
const focusComposer = (event: MouseEvent) => {
  if (!(event.target instanceof Element) || !event.target.closest("[href='#chat']")) return;
  const composer = document.querySelector<HTMLElement>("#chat textarea");
  if (composer === null) return;
  event.preventDefault();
  composer.focus();
};

// A path of this site, made of plain segments and nothing else: a value from a world's data is untrusted, so a scheme, a host,
// a backslash, a space, a control character, a dot segment, a query or a fragment is no link (the browser reads `/\\host` and
// `/<tab>/host` as another host).
const isSitePath = (path: string): boolean => /^(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)+$/.test(path);

export interface ActionsProps {
  /** The place, as a share names and links it. */
  place: SharedPlace;
  /** The place as the device keys what it follows ("universe:world"). */
  follow: string;
  /** The world's proposals' page, which then leads. */
  proposals?: string;
  /** The main action's words, "Say hi in the chat" unless the place names its room. */
  say?: string;
  /** The place's main room, by its id: once its history came with no message in it, the main action asks to be the first (frame 93). */
  room?: string;
  /** Where the main action leads when the place has no chat to say hi in yet: a realm's page, its own page (D375). */
  lead?: { label: string; href: string; icon?: IconName };
  /** A second action beside the main one, outlined: a realm's "Try a function". */
  second?: { label: string; href: string; icon?: IconName };
}

// Whether the room's history came and holds nobody's words, only notices: nobody has said hi yet. False while the chat has not shown it.
const useNobodySpoke = (room: string | undefined) =>
  useApp(({ chat }) => {
    const held = room === undefined ? undefined : chat.rooms[room];
    return held?.paged === true && held.lines.every(({ kind }) => kind === "notice");
  });

// The main action and the one beside it. A world with a proposals realm leads with reading them (frames 22 and 27) and says hi in its room beside; the
// chat is otherwise on the page, where the one thing to do is to say hi in it, unless a place gives its own lead (a realm: its page, trying a function).
function Leads({
  proposals,
  say,
  room,
  lead,
  second,
}: Pick<ActionsProps, "proposals" | "say" | "room" | "lead" | "second">) {
  const first = useNobodySpoke(room);
  if (proposals !== undefined && isSitePath(proposals)) {
    return (
      <>
        <Button href={proposals} emphasis="solid" icon="arrow">
          Read the proposals
        </Button>
        {room === undefined ? null : (
          <Button href="#chat" icon="chat">
            {`Say hi in ${room}`}
          </Button>
        )}
      </>
    );
  }
  const main = lead ?? {
    label: first ? "Be the first to say hi" : (say ?? "Say hi in the chat"),
    href: "#chat",
    icon: "chat" as const,
  };
  return (
    <>
      <Button href={main.href} emphasis="solid" icon={main.icon ?? "arrow"}>
        {main.label}
      </Button>
      {second === undefined ? null : (
        <Button href={second.href} icon={second.icon ?? "arrow"}>
          {second.label}
        </Button>
      )}
    </>
  );
}

export function Actions({ place, follow, ...leads }: ActionsProps) {
  // The focus follows the link to the chat's composer (F2864).
  useEffect(() => {
    document.addEventListener("click", focusComposer);
    return () => {
      document.removeEventListener("click", focusComposer);
    };
  }, []);
  return (
    <Cluster space="2xs">
      <Leads {...leads} />
      <FollowButton kind="worlds" id={follow} quiet />
      <IconButton
        icon="share"
        label="Share"
        onClick={() => {
          sharePlace(place);
        }}
      />
    </Cluster>
  );
}
