// A place's actions (frames 26, 86, 93): the main one, then Follow and Share as the video draws them, with the plate at its first paint
// (a size budget on that paint); the share sheet's code comes at the first press.
import { PHONE_QUERY } from "@gnoworld/core";
import { Button, Cluster, IconButton, type IconName } from "@gnoworld/ui";
import { useEffect } from "react";
import { useApp } from "../../storeContext.tsx";
import { fullChatHref } from "../../fullChat.ts";
import { composerBox, sheetHref, useInPageSheet, useMedia, useSheetClose } from "../chat/index.ts";
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

// Say hi in the room: in words, and on a phone (no room for them) the icon, named, leads back to the chat (the sheet's close, else the chat's anchor).
function SayHi({ room, phone }: { room: string; phone: boolean }) {
  const close = useSheetClose();
  if (!phone) {
    return (
      <Button href="#chat" pad="wide" icon="chat">
        {`Say hi in ${room}`}
      </Button>
    );
  }
  return (
    <IconButton
      icon="chat"
      label={`Say hi in ${room}`}
      onClick={() => {
        if (close === null) window.location.hash = "#chat";
        else close();
      }}
    />
  );
}

// Under 360 px a phone's words and three icons share one 288 px line only when the words are short.
const useProposalsWords = (phone: boolean) =>
  useMedia("(max-width: 359px)") && phone ? "Proposals" : "Read the proposals";

// The place's second action: outlined words, and on a phone a named icon that scrolls to the section its href names, else follows the href.
function Second({ second, phone }: { second: NonNullable<ActionsProps["second"]>; phone: boolean }) {
  if (!phone) {
    return (
      <Button href={second.href} pad="wide" icon={second.icon ?? "arrow"}>
        {second.label}
      </Button>
    );
  }
  return (
    <IconButton
      icon={second.icon ?? "arrow"}
      label={second.label}
      onClick={() => {
        const target = second.href.startsWith("#") ? document.getElementById(second.href.slice(1)) : null;
        if (target === null) window.location.href = second.href;
        else target.scrollIntoView({ block: "start" });
      }}
    />
  );
}

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
  const fit = { pad: "wide" } as const;
  const first = useNobodySpoke(room);
  const sheet = useInPageSheet();
  const words = useProposalsWords(phone);
  if (proposals !== undefined && isSitePath(proposals)) {
    return (
      <>
        <Button href={proposalsHref(proposals, sheet)} {...fit} emphasis="solid" icon="arrow">
          {words}
        </Button>
        {room === undefined ? null : <SayHi room={room} phone={phone} />}
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
      {second === undefined ? null : <Second second={second} phone={phone} />}
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
  const share = (size: "m") => (
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
  // On a phone: one line (Actions.module.css), the main action with its words, then the second action, Say hi, Follow and Share as icon buttons named for assistive
  // technology; nothing wraps, scrolls or stretches.
  if (phone) {
    return (
      <div data-row="" className={[styles["line"], className].join(" ")}>
        <Leads {...leads} phone />
        <FollowButton kind="worlds" id={follow} quiet />
        <IconButton
          icon="share"
          label="Share"
          onClick={() => {
            sharePlace(place);
          }}
        />
      </div>
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
