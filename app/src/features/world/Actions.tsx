// A place's actions (frames 26, 86, 93): the main one, then Follow and Share as the video draws them, with the plate at its first paint
// (a size budget on that paint); the share sheet's code comes at the first press.
import { PHONE_QUERY } from "@gnoworld/core";
import { Button, Cluster, Stack, type IconName } from "@gnoworld/ui";
import { useEffect } from "react";
import { useApp } from "../../storeContext.tsx";
import { fullChatHref } from "../../fullChat.ts";
import { composerBox, sheetHref, useInPageSheet, useMedia } from "../chat/index.ts";
import { FollowButton } from "../follow/index.ts";
import { sharePlace, type SharedPlace } from "../share/index.ts";
import styles from "./Actions.module.css";

// The link goes to the chat; the focus follows it to the composer, so the reader can type at once. The composer is the
// chat's own field: the jump to a fragment would blur it, so when there is one the click stops there. With none (the rooms have
// not loaded, or a guest reads), the link keeps its jump.
const toComposer = (event: MouseEvent) => {
  if (!(event.target instanceof Element) || !event.target.closest("[href='#chat']")) return;
  const composer = composerBox(false);
  if (composer === null) return;
  event.preventDefault();
  composer.focus();
};

// A path of this site, made of plain segments and nothing else: a value from a world's data is untrusted, so a scheme, a host,
// a backslash, a space, a control character, a dot segment, a query or a fragment is no link (the browser reads `/\\host` and
// `/<tab>/host` as another host).
const isSitePath = (path: string): boolean => /^(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)+$/.test(path);

// In a phone's page sheet the proposals are the realm's page, which opens in its own sheet at the plate's page section (#page, where the
// realm's Render lists them); elsewhere the realm's view.
const proposalsHref = (path: string, sheet: boolean): string =>
  sheet ? `${fullChatHref(sheetHref(path, "page"))}#page` : path;

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
  /** Where the main action leads when the place has no chat to say hi in yet: a realm's page, its own page. */
  lead?: { label: string; href: string; icon?: IconName };
  /** A second action beside the main one, outlined: a realm's "Try a function". */
  second?: { label: string; href: string; icon?: IconName };
  /** The row's own class, which its place sets: the plate's narrow placement and its entrance. */
  className?: string | undefined;
}

// Whether the room's history came and holds nobody's words, only notices: nobody has said hi yet. False while the chat has not shown it.
const useNobodySpoke = (room: string | undefined) =>
  useApp(({ chat }) => {
    const held = room === undefined ? undefined : chat.rooms[room];
    return held?.paged === true && held.lines.every(({ kind }) => kind === "notice");
  });

// A phone's two main actions are equal halves of one line (Actions.module.css); elsewhere they are as wide as their words.
const fitOf = (phone: boolean) => (phone ? ({ stretch: true } as const) : ({ pad: "wide" } as const));

// The main action and the one beside it. A world with a proposals realm leads with reading them (frames 22 and 27) and says hi in its room beside; the
// chat is otherwise on the page, where the one thing to do is to say hi in it, unless a place gives its own lead (a realm: its page, trying a function).
function Leads({
  proposals,
  say,
  room,
  lead,
  second,
  phone,
}: Pick<ActionsProps, "proposals" | "say" | "room" | "lead" | "second"> & { phone: boolean }) {
  const fit = fitOf(phone);
  const first = useNobodySpoke(room);
  const sheet = useInPageSheet();
  if (proposals !== undefined && isSitePath(proposals)) {
    return (
      <>
        <Button href={proposalsHref(proposals, sheet)} {...fit} emphasis="solid" icon="arrow">
          Read the proposals
        </Button>
        {room === undefined ? null : (
          <Button href="#chat" {...fit} icon="chat">
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
      <Button href={main.href} {...fit} emphasis="solid" icon={main.icon ?? "arrow"}>
        {main.label}
      </Button>
      {second === undefined ? null : (
        <Button href={second.href} {...fit} icon={second.icon ?? "arrow"}>
          {second.label}
        </Button>
      )}
    </>
  );
}

export function Actions({ place, follow, className, ...leads }: ActionsProps) {
  // The focus follows the link to the chat's composer.
  useEffect(() => {
    document.addEventListener("click", toComposer);
    return () => {
      document.removeEventListener("click", toComposer);
    };
  }, []);
  const phone = useMedia(PHONE_QUERY);
  const share = (size: "s" | "m") => (
    <Button
      icon="share"
      size={size}
      onClick={() => {
        sharePlace(place);
      }}
    >
      Share
    </Button>
  );
  // On a phone: the main actions in halves, then Follow and Share small on a line of their own, never a primary and a secondary wrapped.
  if (phone) {
    return (
      <Stack space="2xs" className={className}>
        <div data-row="" className={styles["halves"]}>
          <Leads {...leads} phone />
        </div>
        <div data-row="">
          <Cluster space="2xs" wrap="no" justify="start">
            <FollowButton kind="worlds" id={follow} size="s" />
            {share("s")}
          </Cluster>
        </div>
      </Stack>
    );
  }
  return (
    <Cluster space="2xs" wrap="scroll" className={className}>
      <Leads {...leads} phone={false} />
      {/* Follow and Share in words, as frame 30 draws them: icons alone left what each does unclear. */}
      <FollowButton kind="worlds" id={follow} size="m" />
      {share("m")}
    </Cluster>
  );
}
