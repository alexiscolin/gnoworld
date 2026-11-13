// The plate's Follow (frames 86, 93): a world followed comes first in the rail and its news in the bell; a person followed shows on the
// labels where they are. Its words say its state ("Following", the check), so a reader never reads a pressed state off a changed name.
import { Button, IconButton } from "@gnoworld/ui";
import { useState } from "react";
import { useFollow, type FollowKind } from "./follow.ts";

export function FollowButton({
  kind,
  id,
  size = "l",
  quiet = false,
}: {
  kind: FollowKind;
  id: string;
  size?: "s" | "m" | "l";
  /** A plate's second action: an icon button, outlined, filled while followed, its words in its tooltip. */
  quiet?: boolean;
}) {
  const { following, toggle } = useFollow(kind, id);
  // A device that refused the change (blocked storage, or one this page could not read) says so: the change holds for this page alone.
  const [refused, setRefused] = useState(false);
  const press = () => {
    setRefused(!toggle());
  };
  return (
    <>
      {quiet ? (
        <IconButton
          icon={following ? "check" : "star"}
          label={following ? "Following" : "Follow"}
          pressed={following}
          onClick={press}
        />
      ) : (
        <Button size={size} {...(following ? { icon: "check" as const } : {})} onClick={press}>
          {following ? "Following" : "Follow"}
        </Button>
      )}
      {refused ? (
        <span role="status" className={`label enter`}>
          Kept for this visit only: this device keeps nothing
        </span>
      ) : null}
    </>
  );
}
