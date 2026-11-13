// Jarvis in the rooms (10u-a): the asks it answers, and the listener the shell draws, whose code comes once the chat in view can ask Jarvis;
// the host and its code come on the first ask, never with the first screen.
export { JARVIS_ASKS, type FirstAsk } from "./asks.ts";

/** The listener's code, in a chunk of its own. */
export const loadListener = async () => (await import("./JarvisListener.tsx")).JarvisListener;
