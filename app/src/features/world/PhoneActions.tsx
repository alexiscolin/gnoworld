// A phone's actions: on one line (Actions.module.css), the main action with its words, then the second action, Say hi, Follow and Share as
// icon buttons named for assistive technology; nothing wraps, scrolls or stretches. Its code is asked once the window is a phone's
// (Actions.tsx), which keeps the row's place meanwhile.
import { Button, IconButton } from "@gnoworld/ui";
import { fullChatHref } from "../../fullChat.ts";
import { sheetHref, useInPageSheet, useMedia, useSheetClose } from "../chat/index.ts";
import { FollowButton } from "../follow/index.ts";
import { sharePlace } from "../share/index.ts";
import styles from "./Actions.module.css";
import type { ActionsProps } from "./Actions.tsx";
import { isSitePath, useMain } from "./actionsShared.ts";

// In a phone's page sheet the proposals are the realm's page, which opens in its own sheet at the plate's page section (#page, where the
// realm's Render lists them); elsewhere the realm's view.
const proposalsHref = (path: string, sheet: boolean): string =>
  sheet ? `${fullChatHref(sheetHref(path, "page"))}#page` : path;

// Say hi in the room: the icon, named, leads back to the chat (the sheet's close, else the chat's anchor).
function SayHi({ room }: { room: string }) {
  const close = useSheetClose();
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
const useProposalsWords = () => (useMedia("(max-width: 359px)") ? "Proposals" : "Read the proposals");

// The place's second action: a named icon that scrolls to the section its href names, else follows the href.
function Second({ second }: { second: NonNullable<ActionsProps["second"]> }) {
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

function Leads({
  proposals,
  say,
  room,
  lead,
  second,
}: Pick<ActionsProps, "proposals" | "say" | "room" | "lead" | "second">) {
  const main = useMain({ room, lead, say });
  const sheet = useInPageSheet();
  const words = useProposalsWords();
  if (proposals !== undefined && isSitePath(proposals)) {
    return (
      <>
        <Button href={proposalsHref(proposals, sheet)} pad="wide" emphasis="solid" icon="arrow">
          {words}
        </Button>
        {room === undefined ? null : <SayHi room={room} />}
      </>
    );
  }
  return (
    <>
      <Button href={main.href} pad="wide" emphasis="solid" icon={main.icon ?? "arrow"}>
        {main.label}
      </Button>
      {second === undefined ? null : <Second second={second} />}
    </>
  );
}

export function PhoneActions({ place, follow, className, ...leads }: ActionsProps) {
  return (
    <div data-row="" className={[styles["line"], className].join(" ")}>
      <Leads {...leads} />
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
