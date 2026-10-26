// A world's rooms by section (slice 4's 4b): the sections the server lists, in its order, a section with no
// room left out; each room a link to its address on the site, the one shown marked. An account's direct messages
// follow (4e), each conversation a link to its page, with the choice to hear from those it wrote to alone.
import type { RoomList } from "@gnoworld/schemas";
import { Chip, Icon, Row, Stack } from "@gnoworld/ui";
import { dmHref, roomHref, roomLabel, shortAddress } from "./names.ts";
import shared from "./lists.module.css";
import styles from "./RoomsView.module.css";

export interface RoomsViewProps {
  sections: RoomList["sections"];
  current: string | undefined;
  /** An account's direct messages: none for a guest. */
  dms?: DmsProps | undefined;
}

export interface DmsProps {
  world: string;
  /** The accounts it has a conversation with, in the order shown. */
  partners: readonly string[];
  /** The conversation in view. */
  current: string | undefined;
  /** Whether it hears from those it wrote to alone. */
  onlyKnown: boolean;
  onOnlyKnown: (only: boolean) => void;
}

function Dms({ world, partners, current, onlyKnown, onOnlyKnown }: DmsProps) {
  return (
    <Stack space="2xs" as="section">
      <h2 className={styles["section"]}>Direct messages</h2>
      {partners.length === 0 ? (
        // How to start one, in lines as short as the list's own (U4).
        <div>
          <p>No direct message yet.</p>
          <p>Start one in Who&apos;s here.</p>
        </div>
      ) : (
        <ul className={shared["plain"]}>
          {partners.map((partner) => (
            <li key={partner}>
              {/* Its trust in a lock and a word, as a conversation's header says it (DESIGN-SYSTEM.md; U6). */}
              <Row
                title={shortAddress(partner)}
                subtitle="Not encrypted"
                lead={<Icon name="lock" />}
                href={dmHref(world, partner)}
                current={partner === current}
              />
            </li>
          ))}
        </ul>
      )}
      <Chip
        selected={onlyKnown}
        onClick={() => {
          onOnlyKnown(!onlyKnown);
        }}
      >
        Only people I wrote to
      </Chip>
    </Stack>
  );
}

export function RoomsView({ sections, current, dms }: RoomsViewProps) {
  const shown = sections.filter(({ rooms }) => rooms.length > 0);
  const listed =
    shown.length === 0 ? (
      <p>No room here yet.</p>
    ) : (
      <Stack space="m">
        {shown.map(({ name, rooms }) => (
          <Stack key={name ?? ""} space="2xs" as="section">
            <h2 className={styles["section"]}>{name ?? (shown.length === 1 ? "Rooms" : "Other rooms")}</h2>
            <ul className={shared["plain"]}>
              {rooms.map(({ room }) => (
                <li key={room}>
                  <Row title={roomLabel(room)} href={roomHref(room)} current={room === current} />
                </li>
              ))}
            </ul>
          </Stack>
        ))}
      </Stack>
    );
  return (
    <nav aria-label={dms === undefined ? "Rooms" : "Rooms and direct messages"} className={shared["scrolls"]}>
      {dms === undefined ? (
        listed
      ) : (
        <Stack space="l">
          {listed}
          <Dms {...dms} />
        </Stack>
      )}
    </nav>
  );
}
