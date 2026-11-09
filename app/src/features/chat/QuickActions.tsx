// The quick actions, behind the composer's + (Alexis, 2026-11-08: "un icône + en bas à gauche"): an image, then the conversation's own,
// the Earth's (Quiz, Poll, Jarvis), a world's with a realm (Proposal, Realm, Catch up, Jarvis), a world's without (Play, Catch up, Poll,
// Jarvis), a direct message's (Quiz): Jarvis reads a room, so none in a private talk. What a later slice brings is greyed (ui's Menu).
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
}

const soon = (label: string, icon: NonNullable<MenuItem["icon"]>): MenuItem => ({ label, icon, soon: true });

export function QuickActions({ pills, realm, poll: send }: QuickActionsProps) {
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
  const jarvis = soon("Jarvis", "spark");
  const catchUp = soon("Catch up", "news");
  const items: Record<PillsOf, MenuItem[]> = {
    earth: [soon("Quiz", "star"), ...poll, jarvis],
    realm: [soon("Proposal", "seal"), ...realmItem, catchUp, jarvis],
    hub: [soon("Play", "play"), catchUp, ...poll, jarvis],
    dm: [soon("Quiz", "star")],
  };
  return (
    <>
      <Menu
        trigger="Add"
        label="Add to the conversation"
        icon="plus"
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
