// Whether space has drawn its first frame, and who waits for it.
const state = { done: false, heard: new Set<() => void>() };

/** Space drew its first frame: those who waited are told. */
export function drew(): void {
  state.done = true;
  for (const heard of state.heard) heard();
}

/** Whether space has drawn its first frame. */
export const drawnYet = (): boolean => state.done;

/** Calls `heard` once the first frame is drawn (at once if it was). */
export function onDrawn(heard: () => void): () => void {
  if (state.done) heard();
  state.heard.add(heard);
  return () => state.heard.delete(heard);
}
