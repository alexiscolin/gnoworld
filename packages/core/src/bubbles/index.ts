// What the Earth's signs and the chat import of the bubbles: `@gnoworld/core/bubbles`, a subpath beside the main entry, so the first
// screen does not carry them (docs/plans/slice-6.md §7).
export { centreOf, COUNTRIES, countryName } from "./countries.ts";
export { cutText } from "./cut.ts";
export { isFarSide, type LatLon } from "./farSide.ts";
export { bubbleLines, isPublicRoom, type EarthRoom } from "./lines.ts";
export { pickBubbles } from "./pickBubbles.ts";
export type { Rules } from "./rules.ts";
export { countryTrends, type Trend } from "./trend.ts";
export { turnTo } from "./turn.ts";
export type { Bubble, BubbleMessage, Count, PickArgs, Picked, Viewer } from "./types.ts";
