// A room's notification mode, chosen in the room (slice 4's 4f-n; ADR-0002, "Menu and settings"): all messages, mentions
// (and replies, and a mention of the room where it counts) or nothing, mentions included. Kept on the device.
import type { NoticeMode } from "@gnoworld/core";
import { Chip, Cluster, Stack } from "@gnoworld/ui";
import { roomLabel } from "./names.ts";

export interface NoticeModesProps {
  room: string;
  mode: NoticeMode;
  onMode: (mode: NoticeMode) => void;
  /** Whether the device did not keep the choice. */
  notKept?: boolean | undefined;
}

const MODES: readonly { mode: NoticeMode; name: string }[] = [
  { mode: "all", name: "All messages" },
  { mode: "mentions", name: "Mentions" },
  { mode: "none", name: "Nothing" },
];

export function NoticeModes({ room, mode, onMode, notKept }: NoticeModesProps) {
  return (
    <Stack space="3xs">
      <div role="group" aria-label={`Notifications for ${roomLabel(room)}`}>
        <Cluster space="2xs">
          {MODES.map((each) => (
            <Chip
              key={each.mode}
              selected={mode === each.mode}
              onClick={() => {
                onMode(each.mode);
              }}
            >
              {each.name}
            </Chip>
          ))}
        </Cluster>
      </div>
      <p>Nothing: not even mentions.</p>
      {notKept === true ? <p>Not kept on this device</p> : null}
    </Stack>
  );
}
