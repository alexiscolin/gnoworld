// The bell's later code, behind one small chunk: the lists of files the panel and the count's watch preload stay in it, and so off the
// first screen, where they would cost the root's chunk.
export const watch = async () => ({ default: (await import("./Watch.tsx")).Watch });
export const panel = async () => ({ default: (await import("./Panel.tsx")).Panel });
