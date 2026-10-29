// A world's rooms by section (slice 4's 4b): the sections the server lists, in its order, a section with no
// room left out; each room a link to its address on the site, the one shown marked. An account's direct messages
// follow (4e), each conversation a link to its page, with the choice to hear from those it wrote to alone.
import type { Notice } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { useRef, type ReactNode } from "react";
import { Button, Chip, Cluster, Icon, Row, Stack } from "@gnoworld/ui";
import { dmHref, isAccount, roomHref, roomLabel, shortAddress } from "./names.ts";
import { countWords } from "./unread.ts";
import { RoomSections, RoomsNav } from "./RoomSections.tsx";
import shared from "./lists.module.css";
import styles from "./RoomsView.module.css";

export interface RoomsViewProps {
  sections: RoomList["sections"];
  current: string | undefined;
  /** An account's direct messages: none for a guest. */
  dms?: DmsProps | undefined;
  /** What says the rooms could not load, in their place (CR8). */
  failed?: ReactNode;
  /** The unseen count by room id or by a conversation's partner; none or 0 draws no badge (4f-n). */
  badges?: Readonly<Record<string, number>> | undefined;
  /** What the account was told: none for a guest (4f-n). */
  notices?: NoticesProps | undefined;
}

interface NoticesProps {
  /** The unseen notices, oldest first. */
  list: readonly Notice[];
  world: string;
  /** What a screen reader is told as a notice comes, in a status of its place. */
  said: string;
  /** The id of the notice said, which keys the status so the same words said again are said anew. */
  saidId?: string;
  onClear: () => void;
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
  /** Whether the device failed to keep that choice and those written to (CR5). */
  notKept?: boolean | undefined;
}

// What a row says it holds unseen: its count, 99+ past 99, as a mark after the link, so the link is named by the room alone.
const badged = (count: number | undefined) =>
  count === undefined || count < 1 ? undefined : <Chip tone="signal">{`${countWords(count)} unread`}</Chip>;

const WORDS = {
  mention: "mentioned you",
  group: "mentioned the room",
  reply: "replied to you",
  dm: "wrote to you",
} as const;
const whoIs = (by: string) => (isAccount(by) ? shortAddress(by) : by);

/** What a screen reader is told of a notice: who did what, and where. */
export const noticeSaid = ({ kind, by, where }: Notice): string =>
  `${whoIs(by)} ${WORDS[kind]}${kind === "dm" ? "" : ` in ${roomLabel(where)}`}`;

// What the account was told, newest first, each a link to where.
// The keyboard's place goes to the navigation as the list changes under it (Clear, a link followed): the button or the
// link is gone with the notice, and the focus would fall to the page.
function Notices({
  list,
  world,
  onClear,
  navRef,
}: Omit<NoticesProps, "said" | "saidId"> & { navRef: { current: HTMLElement | null } }) {
  return (
    <Stack space="2xs" as="section">
      <Cluster space="xs" justify="between">
        <h2 className={styles["section"]}>Notifications</h2>
        <Button
          size="s"
          emphasis="quiet"
          onClick={() => {
            onClear();
            navRef.current?.focus();
          }}
        >
          Clear
        </Button>
      </Cluster>
      <ul
        className={shared["plain"]}
        onClick={() => {
          navRef.current?.focus();
        }}
      >
        {list.toReversed().map((notice) => (
          <li key={notice.id}>
            <Row
              title={`${whoIs(notice.by)} ${WORDS[notice.kind]}`}
              subtitle={notice.kind === "dm" ? "Direct message" : roomLabel(notice.where)}
              href={notice.kind === "dm" ? dmHref(world, notice.where) : roomHref(notice.where)}
            />
          </li>
        ))}
      </ul>
    </Stack>
  );
}

function Dms({
  world,
  partners,
  current,
  onlyKnown,
  onOnlyKnown,
  notKept,
  badges,
}: DmsProps & { badges: RoomsViewProps["badges"] }) {
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
                trail={badged(badges?.[partner])}
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
      {notKept === true ? <p>Not kept on this device</p> : null}
    </Stack>
  );
}

/** What a screen reader is told as a notice comes: a status always on the page, never inside the rooms' list, which a
 * phone's closed drawer hides from it (F2301). Its own place, so an empty list still says what comes. */
export function NoticeStatus({ notices }: { notices: Pick<NoticesProps, "said" | "saidId"> | undefined }) {
  // None for a guest, who is told of nothing.
  return notices === undefined ? null : (
    <p key={notices.saidId} role="status" className="visually-hidden">
      {notices.said}
    </p>
  );
}

export function RoomsView({ sections, current, dms, failed, badges, notices }: RoomsViewProps) {
  const navRef = useRef<HTMLElement>(null);
  const listed = (
    <RoomSections sections={sections} current={current} failed={failed} trail={(room) => badged(badges?.[room])} />
  );
  const body =
    dms === undefined ? (
      listed
    ) : (
      <Stack space="l">
        {listed}
        <Dms {...dms} badges={badges} />
      </Stack>
    );
  return (
    <RoomsNav navRef={navRef} label={dms === undefined ? "Rooms" : "Rooms and direct messages"}>
      {notices === undefined ? (
        body
      ) : (
        <Stack space="l">
          {body}
          {/* After the rooms, so a first notice moves none of their rows (U4). */}
          {notices.list.length === 0 ? null : <Notices {...notices} navRef={navRef} />}
        </Stack>
      )}
    </RoomsNav>
  );
}
