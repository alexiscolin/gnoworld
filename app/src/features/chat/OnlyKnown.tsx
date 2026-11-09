// The choice to hear from those the account wrote to alone (4e), in the room's menu: an account's, so its code is never a
// visitor's first screen.
import { Chip, Cluster } from "@gnoworld/ui";
import type { DmsProps } from "./RoomsView.tsx";
import { Setting } from "./RoomMenu.tsx";

/** The choice, both sides named so the one in force shows; what it says when the device did not keep it is the rooms column's, in view. */
export function OnlyKnown({ onlyKnown, onOnlyKnown }: Pick<DmsProps, "onlyKnown" | "onOnlyKnown">) {
  return (
    <Setting
      label="Direct messages from"
      help={onlyKnown ? "You hear only from people you wrote to first." : "You hear from anyone who writes to you."}
    >
      <div role="group" aria-label="Direct messages from">
        <Cluster space="2xs">
          <Chip
            selected={!onlyKnown}
            onClick={() => {
              onOnlyKnown(false);
            }}
          >
            Anyone
          </Chip>
          <Chip
            selected={onlyKnown}
            onClick={() => {
              onOnlyKnown(true);
            }}
          >
            People I wrote to
          </Chip>
        </Cluster>
      </div>
    </Setting>
  );
}
