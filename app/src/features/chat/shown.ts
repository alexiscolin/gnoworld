// The conversation in view on a world's page (slice 4's 4e), one RoomView and one Writer whatever it is: a room's or
// a direct message's, what each is told.
import type { AppState } from "../../store/index.ts";
import { NOT_ENCRYPTED, type Dms } from "./Dms.tsx";
import { roomLabel, shortAddress } from "./names.ts";
import type { RoomViewProps } from "./RoomView.tsx";
import type { WriterProps } from "./Writer.tsx";

// The conversation in view, one RoomView and one Writer whatever it is: what each is told. Its key keeps a room's
// drawing apart from a direct message's.
export interface Shown {
  key: "room" | "dm";
  view: Pick<RoomViewProps, "title" | "note" | "state" | "empty">;
  writer: Pick<WriterProps, "room" | "label" | "members" | "onSay" | "refused">;
}

// A direct message's (4e): its partner named, not encrypted, no one beside it; a line Ergo refused said so.
export function dmShown(partner: string, dms: Dms, sayTo: (partner: string, draft: string) => boolean): Shown {
  const title = shortAddress(partner);
  const { refused } = dms;
  return {
    key: "dm",
    view: { title, note: NOT_ENCRYPTED, state: { lines: dms.lines, members: [] }, empty: dms.empty },
    writer: {
      room: partner,
      label: title,
      members: [],
      onSay: (draft) => sayTo(partner, draft),
      refused: refused === undefined ? undefined : { ...refused, why: `Not sent: ${title} is not online.` },
    },
  };
}

// A room's: its label, its description; who is here goes beside it.
export function roomShown(
  room: string,
  state: AppState["chat"]["rooms"][string] | undefined,
  say: (room: string, draft: string) => boolean,
): Shown {
  return {
    key: "room",
    view: { title: roomLabel(room), note: state?.topic, state },
    writer: { room, members: state?.members ?? [], onSay: (draft) => say(room, draft) },
  };
}
