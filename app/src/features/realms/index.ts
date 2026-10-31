// A realm's page and card (5h): the view a route draws. The route's module is a chunk of its own, asked only when the path
// is a realm's, so the view and the page reader are never in a world page's first screen. Nothing else of this folder is
// imported from outside.
export { RealmView } from "./RealmView.tsx";
