// A realm page's drawing for a page's capture (8f): 8a's slot, filled at the first screen with a few bytes that ask the drawing's own
// chunk when a capture draws, never the realm view's.
import { plug } from "../../slots.tsx";

plug("pageDrawing", async () => (await import("./RealmBlocks.tsx")).RealmBlocks);
