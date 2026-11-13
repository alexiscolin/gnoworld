// The quick actions, behind the composer's "/" (what they put in are commands and cards): an image, then the conversation's own,
// the Earth's (Market chart, Poll, Jarvis), a world's with a realm (Proposal, Realm, Catch up, Jarvis, Market chart), a world's without (Play,
// Catch up, Poll, Jarvis, Market chart), a direct message's (none: its cards need a room). What a later slice brings is greyed (ui's Menu).
import { Menu, type MenuItem } from "@gnoworld/ui";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { PollDialog, type PollDialogProps } from "./PollDialog.tsx";

/** What a conversation is, for its acts: the Earth's general chat, a world's with a realm or without, a direct message. */
type PillsOf = "earth" | "realm" | "hub" | "dm";

/** A world's pinned actions as its route hands them, drawn as their code comes. */
export interface Pinned {
  pills: ReactNode;
  cards: ReactNode;
}

export interface QuickActionsProps {
  pills: PillsOf;
  /** The world's realm's view on the site, which Realm opens. */
  realm?: string | undefined;
  /** Where Poll's dialog sends: the room, the account's nick and the composer's way to say a line; none, no Poll. */
  poll?: Omit<PollDialogProps, "open" | "onClose"> | undefined;
  /** Opens Jarvis's panel over the room (10u-a); none while Jarvis is off or the room is none: Jarvis and Catch up stay greyed. */
  jarvis?: ((what: "intro" | "catch-up") => void) | undefined;
  /** Adds the market card to the room, the reader's alone; none where there is no room to hold it (a direct message). */
  market?: (() => void) | undefined;
  /** Why Jarvis is greyed when it is on but cannot be asked here; none, it is coming soon (Jarvis is off). */
  jarvisWhy?: string | undefined;
}

const soon = (label: string, icon: NonNullable<MenuItem["icon"]>, why?: string): MenuItem => ({
  label,
  icon,
  soon: true,
  ...(why === undefined ? {} : { why }),
});

export function QuickActions({ pills, realm, poll: send, jarvis: openJarvis, market, jarvisWhy }: QuickActionsProps) {
  const navigate = useNavigate();
  const [polling, setPolling] = useState(false);
  const poll: MenuItem[] =
    send === undefined
      ? []
      : [
          {
            label: "Poll",
            icon: "chart",
            onSelect: () => {
              setPolling(true);
            },
          },
        ];
  const realmItem: MenuItem[] =
    realm === undefined
      ? []
      : [
          {
            label: "Realm",
            icon: "arrow-up-right",
            onSelect: () => {
              Promise.resolve(navigate(realm)).catch(reportError);
            },
          },
        ];
  const open = (label: string, icon: NonNullable<MenuItem["icon"]>, what: "intro" | "catch-up"): MenuItem =>
    openJarvis === undefined
      ? soon(label, icon, jarvisWhy)
      : {
          label,
          icon,
          onSelect: () => {
            openJarvis(what);
          },
        };
  const jarvis = open("Jarvis", "spark", "intro");
  const catchUp = open("Catch up", "news", "catch-up");
  const marketItem: MenuItem[] =
    market === undefined ? [] : [{ label: "Market chart", icon: "chart", onSelect: market }];
  const items: Record<PillsOf, MenuItem[]> = {
    earth: [...marketItem, ...poll, jarvis],
    realm: [soon("Proposal", "seal"), ...realmItem, catchUp, jarvis, ...marketItem],
    hub: [soon("Play", "play"), catchUp, ...poll, jarvis, ...marketItem],
    dm: [],
  };
  return (
    <>
      <Menu
        trigger="Add"
        label="Add to the conversation"
        icon="slash"
        emphasis="plain"
        size="s"
        items={[soon("Image", "image"), ...items[pills]]}
      />
      {send === undefined ? null : (
        <PollDialog
          {...send}
          open={polling}
          onClose={() => {
            setPolling(false);
          }}
        />
      )}
    </>
  );
}
