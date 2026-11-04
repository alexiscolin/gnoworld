// The plate's Follow and Share (frames 86, 93), in a chunk of their own asked a moment after the first screen (Actions.tsx): they act on
// this device alone, so the page the build writes has neither.
import { Button } from "@gnoworld/ui";
import { FollowButton } from "../follow/index.ts";
import { sharePlace, type SharedPlace } from "../share/index.ts";

export function PlateActs({ place, follow }: { place: SharedPlace; follow: string }) {
  return (
    <>
      <FollowButton kind="worlds" id={follow} />
      <Button
        size="l"
        onClick={() => {
          sharePlace(place);
        }}
      >
        Share
      </Button>
    </>
  );
}
