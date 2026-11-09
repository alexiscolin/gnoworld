// A world's rooms as the chat lists them: a search over its sections, and on the Earth (D394) for an account the button that makes one.
// A guest searches, and sees no word about making one (Alexis, 2026-11-08).
import type { RoomList } from "@gnoworld/schemas";
import { Field, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { useApp } from "../../storeContext.tsx";
import { roomLabel } from "./names.ts";
import { NewRoom } from "./NewRoom.tsx";
import { RoomSections, type RoomSectionsProps } from "./RoomSections.tsx";
import styles from "./RoomsView.module.css";

// The Earth's list always holds its main room, which no other world's does by that name.
const onEarth = (sections: RoomList["sections"]): boolean =>
  sections.some(({ rooms }) => rooms.some(({ room }) => room === "#earth"));

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

// Every world's rooms under a search, as Slack's and Discord's (Alexis, 2026-11-08: "la barre de recherche doit être partout"); on the
// Earth an account may also make one (D394).
export function RoomsList(props: RoomSectionsProps) {
  const [query, setQuery] = useState("");
  const signedIn = useApp(({ login }) => login.session.kind === "in");
  const found = matching(props.sections, query);
  const make = signedIn && onEarth(props.sections);
  return (
    <Stack space="m">
      <Field
        label="Search rooms"
        hideLabel
        kind="search"
        placeholder="Search rooms"
        value={query}
        onChange={setQuery}
      />
      {query !== "" && found.length === 0 ? (
        <p className={styles["note"]}>No room matches.</p>
      ) : (
        <RoomSections {...props} sections={found} action={make ? <NewRoom /> : undefined} />
      )}
    </Stack>
  );
}
