// The "Share" of the "First to chart" pill (frame 93): 8a's slot, filled at the first screen with a few bytes that ask the share's own
// code at the press.
import { plug } from "../../slots.tsx";

plug("share", (place) => {
  import("./share.ts").then(({ sharePlace }) => {
    sharePlace(place);
  }, reportError);
});
