// The plate's Follow (frames 86, 93): a world followed comes first in the rail and its news in the bell; a person followed shows on the
// labels where they are. Its words say its state ("Following", the check), so a reader never reads a pressed state off a changed name.
import { Button } from "@gnoworld/ui";
import { useState } from "react";
import { useFollow, type FollowKind } from "./follow.ts";

export function FollowButton({ kind, id, size = "l" }: { kind: FollowKind; id: string; size?: "m" | "l" }) {
  const { following, toggle } = useFollow(kind, id);
  // A device that refused the change (blocked storage, or one this page could not read) says so: the change holds for this page alone.
  const [refused, setRefused] = useState(false);
  return (
    <>
      <Button
        size={size}
        {...(following ? { icon: "check" as const } : {})}
        onClick={() => {
          setRefused(!toggle());
        }}
      >
        {following ? "Following" : "Follow"}
      </Button>
      {refused ? (
        <span role="status" className="label">
          Kept for this visit only: this device keeps nothing
        </span>
      ) : null}
    </>
  );
}
