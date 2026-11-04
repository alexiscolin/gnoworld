// A realm's page and card (5h): the view a route draws. The route's module is a chunk of its own, asked only when the path
// is a realm's, so the view and the page reader are never in a world page's first screen.
export { RealmView } from "./RealmView.tsx";
// The proposal card and the read's source and failure, for a world's page (features/world/Proposals.tsx), which asks for them
// after it has hydrated, in a chunk of its own.
export { ProposalCard } from "./ProposalCard.tsx";
export { ReadFailed } from "./ReadSource.tsx";
// A realm page's drawing, for a page's capture (8f, features/previews), which asks for it in a chunk of its own.
export { RealmBlocks } from "./RealmBlocks.tsx";
