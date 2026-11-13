// A card line drawn as its card: the line's words are core's cardLine.ts's, and each reader's page reads the card's data itself.
// Each card is a chunk of its own, asked when its first line is drawn; it comes in by the page's own fade.
import type { CardLine } from "@gnoworld/core";
import { lazy, Suspense } from "react";

const MarketCard = lazy(() => import("./MarketCard.tsx"));
const TrendingCard = lazy(() => import("./TrendingCard.tsx"));
const ProposalsCard = lazy(() => import("./ProposalsCard.tsx"));

const drawn = (card: CardLine) => {
  if (card.kind === "trending") return <TrendingCard />;
  if (card.kind === "proposals") return <ProposalsCard />;
  return <MarketCard only={card.symbol === undefined ? undefined : [card.symbol]} />;
};

export function SharedCard({ card }: { card: CardLine }) {
  return (
    <div data-shared-card={card.kind} className="enter">
      <Suspense fallback={null}>{drawn(card)}</Suspense>
    </div>
  );
}
