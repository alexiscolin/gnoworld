// The choice to hear from those the account wrote to alone (4e), in the room's menu: an account's, so its code is never a
// visitor's first screen.
import { Chip, Stack } from "@gnoworld/ui";
import type { DmsProps } from "./RoomsView.tsx";

/** The choice, and what it says when the device did not keep it. */
export function OnlyKnown({
  onlyKnown,
  onOnlyKnown,
  notKept,
}: Pick<DmsProps, "onlyKnown" | "onOnlyKnown" | "notKept">) {
  return (
    <Stack space="3xs">
      <Chip
        selected={onlyKnown}
        onClick={() => {
          onOnlyKnown(!onlyKnown);
        }}
      >
        Only people I wrote to
      </Chip>
      {notKept === true ? <p>Not kept on this device</p> : null}
    </Stack>
  );
}
