// A realm's page and card (5h): the view a route draws. The route's module is a chunk of its own, asked only when the path
// is a realm's, so the view and the page reader are never in a world page's first screen.
export { RealmView } from "./RealmView.tsx";
// The proposal card and the read's source and failure, for a world's page (features/world/Proposals.tsx), which asks for them
// after it has hydrated, in a chunk of its own.
export { ProposalCard } from "./ProposalCard.tsx";
export { ReadFailed } from "./ReadSource.tsx";
// A world's pinned actions (D271), on its page and in its chat's bar, from chunks asked after hydration.
export { ActionForm } from "./ActionForm.tsx";
export { InlineCard } from "./InlineCard.tsx";
