// The card under a line (link-previews L4), when the line has one (lineCard.ts): drawn by LinkCard, a chunk of its own asked by such a line
// alone. A removal or an edit takes it away, the focus it held going back to the line (F896's class).
import { cardLinkOf, type Block } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import { lazy, Suspense } from "react";
import { site } from "../../places.ts";
import { useFocusKept } from "./focusKept.ts";
import { lineCard } from "./lineCard.ts";
import { previewIn } from "./pageLinks.ts";

const LinkCard = lazy(() => import("./LinkCard.tsx"));

export interface LineCardProps {
  /** The room's name, the id a removal names and the key the server told, the reader's right to pin there, and whether the reader saves data (cardOf); none: no card. */
  card: { room: string; msgid: string; key: string | undefined; may: boolean; saving: boolean } | undefined;
  /** The line's words, and what they say: a player or a realm's capture gives the card way. */
  text: string;
  blocks: readonly Block[];
  player: boolean;
  verdict: StreamEvent["state"] | undefined;
  mine: boolean;
  /** Whether its link is a Tab stop: on the list's stop alone (U1). */
  tabbable: boolean;
}

export const LineCard = ({ card, ...line }: LineCardProps) =>
  card === undefined ? null : <Carded card={card} {...line} />;

function Carded({
  card: asked,
  text,
  blocks,
  player,
  verdict,
  mine,
  tabbable,
}: LineCardProps & { card: NonNullable<LineCardProps["card"]> }) {
  const { room, msgid, key, may, saving } = asked;
  // Read only for a line that has a card: the first screen's lines are never read twice for it.
  const capture = key !== undefined && previewIn(blocks, site.universeAt("/").gnoweb ?? "") !== undefined;
  const card = lineCard({ key, verdict, room, player, capture, mine, may });
  const href = card === undefined ? undefined : cardLinkOf(text);
  const kept = useFocusKept(card === undefined || href === undefined);
  return card === undefined || href === undefined ? null : (
    <div {...kept}>
      <Suspense fallback={null}>
        <LinkCard
          cardKey={card.key}
          room={room}
          msgid={msgid}
          href={href}
          saving={saving}
          removable={card.removable}
          tabbable={tabbable}
        />
      </Suspense>
    </div>
  );
}
