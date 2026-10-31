// The choice to hear from those the account wrote to alone (4e), in the room's menu: an account's, so its code is never a
// visitor's first screen.
import { Chip } from "@gnoworld/ui";
import type { DmsProps } from "./RoomsView.tsx";

/** The choice; what it says when the device did not keep it is the rooms column's, in view. */
export function OnlyKnown({ onlyKnown, onOnlyKnown }: Pick<DmsProps, "onlyKnown" | "onOnlyKnown">) {
  return (
    <Chip
      selected={onlyKnown}
      onClick={() => {
        onOnlyKnown(!onlyKnown);
      }}
    >
      Only people I wrote to
    </Chip>
  );
}
