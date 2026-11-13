// The page's asks Jarvis answers (pageAsks.ts): its introduction, Catch up, a question of one's own and a line it said. The account menu
// listens for them before Jarvis's code has come, the listener once it has.
export const JARVIS_ASKS = ["jarvis", "jarvis-catch-up", "jarvis-ask", "jarvis-said"] as const;

/** The ask that brings Jarvis's host. */
export type FirstAsk = (typeof JARVIS_ASKS)[number];
