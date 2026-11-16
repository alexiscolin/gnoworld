// A world's rooms as the chat lists them: a search over its sections, and on the Earth for an account the button that makes one.
// A guest searches, and sees no word about making one.
import type { RoomList } from "@gnoworld/schemas";
import { Field, Stack } from "@gnoworld/ui";
import { createContext, use, useState } from "react";
import { roomLabel } from "./names.ts";
import { NewRoom, useMayMakeRoom } from "./NewRoom.tsx";
import { RoomSections, type RoomSectionsProps } from "./RoomSections.tsx";
import styles from "./RoomsView.module.css";

/** The rooms whose name holds `query`, a section with none left out; all of them for an empty query. */
function matching(sections: RoomList["sections"], query: string): RoomList["sections"] {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return sections;
  return sections
    .map((section) => ({
      ...section,
      rooms: section.rooms.filter(({ room }) => `${roomLabel(room)} ${room}`.toLowerCase().includes(wanted)),
    }))
    .filter(({ rooms }) => rooms.length > 0);
}

export { RoomsNav } from "./RoomSections.tsx";

/** What a list looks like where it stands: the default is the column's and the menu's (the filter always, New room a "+" at the first
 * section's name); a phone's drawer (DRAWER) shows its filter past PagedList's 12 rooms and New room as a full-width button at the foot. */
export const RoomsLookContext = createContext({ filterPast: 0, wideNew: false });
export const DRAWER = { filterPast: 12, wideNew: true };

// Every world's rooms under a search, as Slack's and Discord's; on the
// Earth an account may also make one.
export function RoomsList(props: RoomSectionsProps) {
  const [query, setQuery] = useState("");
  const found = matching(props.sections, query);
  const make = useMayMakeRoom(props.sections);
  const { filterPast, wideNew } = use(RoomsLookContext);
  // Over the list's whole length, not the found rooms', so the field does not leave as its own text narrows them.
  const filtered =
    filterPast === 0 || props.sections.reduce((count, { rooms }) => count + rooms.length, 0) > filterPast;
  return (
    <Stack space="m">
      {filtered ? (
        <Field
          label="Search rooms"
          hideLabel
          kind="search"
          placeholder="Search rooms"
          value={query}
          onChange={setQuery}
        />
      ) : null}
      {query !== "" && found.length === 0 ? (
        <p className={["meta", styles["note"]].join(" ")}>No room matches.</p>
      ) : (
        <RoomSections {...props} sections={found} action={make && !wideNew ? <NewRoom /> : undefined} />
      )}
      {make && wideNew ? <NewRoom wide /> : null}
    </Stack>
  );
}
