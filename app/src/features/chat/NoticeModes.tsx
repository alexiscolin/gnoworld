// A room's notification mode, chosen in the room (slice 4's 4f-n; ADR-0002, "Menu and settings"): all messages, mentions
// (and replies, and a mention of the room where it counts) or nothing, mentions included. Kept on the device.
import { NOTICE_MODES, type NoticeMode } from "@gnoworld/core";
import { Chip, Cluster } from "@gnoworld/ui";
import { Setting } from "./RoomMenu.tsx";
import { roomLabel } from "./names.ts";

export interface NoticeModesProps {
  room: string;
  mode: NoticeMode;
  onMode: (mode: NoticeMode) => void;
  /** Whether the device did not keep the choice. */
  notKept?: boolean | undefined;
}

const NAMES: Record<NoticeMode, string> = { all: "All messages", mentions: "Mentions", none: "Nothing" };
// What the selected mode does, in its own words: Nothing leaves out the mentions too, which its name does not tell (U2).
const WORDS: Record<NoticeMode, string> = {
  all: "Every new message in this room.",
  mentions: "Messages that mention you, and replies to you.",
  none: "Nothing: not even mentions.",
};

export function NoticeModes({ room, mode, onMode, notKept }: NoticeModesProps) {
  return (
    <Setting
      label="Notify me about"
      help={
        <>
          <p>{WORDS[mode]}</p>
          {notKept === true ? <p>Not kept on this device</p> : null}
        </>
      }
    >
      <div role="group" aria-label={`Notifications for ${roomLabel(room)}`}>
        <Cluster space="2xs">
          {NOTICE_MODES.map((each) => (
            <Chip
              key={each}
              selected={mode === each}
              onClick={() => {
                onMode(each);
              }}
            >
              {NAMES[each]}
            </Chip>
          ))}
        </Cluster>
      </div>
    </Setting>
  );
}
