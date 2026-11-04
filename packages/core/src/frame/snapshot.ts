// A share's picture of the view (slice 8): the page asks the scene's canvas for it by one event, and the scene answers on the same canvas by
// another, a copy of its next frame as the answer's detail. The canvas alone: nothing the page draws over it is in it.

/** The event a share sends the scene's canvas. */
export const SNAPSHOT_EVENT = "gnoworld:snapshot";
/** The scene's answer on its canvas: the picture, a canvas, as its detail; none when it could not copy. */
export const SNAPSHOT_TAKEN = "gnoworld:snapshot-taken";
