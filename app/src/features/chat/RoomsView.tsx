// A world's rooms by section (slice 4's 4b): the sections the server lists, in its order, a section with no
// room left out; each room a link to its address on the site, the one shown marked. An account's direct messages
// follow (4e), each conversation a link to its page, with the choice to hear from those it wrote to alone.
import type { Notice } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { useRef, type ReactNode } from "react";
import { Avatar, Button, Cluster, EmptyState, IconButton, NavItem, Row, Stack } from "@gnoworld/ui";
import { NOT_ENCRYPTED, PAGE_ONLY } from "./Dms.tsx";
import { useFull } from "./full.ts";
import { dmHref, hrefProp, roomHref, roomLabel, shortAddress, whoIs } from "./names.ts";
import { noticeDone } from "../../told.ts";
import { badged } from "./unread.ts";
import { RoomsList, RoomsNav } from "./RoomsList.tsx";
import { Folding } from "./RoomSections.tsx";
import shared from "./lists.module.css";
import { askFor } from "../../pageAsks.ts";
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
  /** What stands last, under the direct messages: an account's saved messages (4d) and the room's media (8d). */
  media?: ReactNode;
  saved?: ReactNode;
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
  /** Everyone in a room the page follows, space-separated: a partner among them gets the video's green dot (frame 56). */
  present?: string | undefined;
}

/** What a screen reader is told of a notice: who did what, and where. */
export const noticeSaid = (notice: Notice): string =>
  `${noticeDone(whoIs(notice.by), notice.kind)}${notice.kind === "dm" ? "" : ` in ${roomLabel(notice.where)}`}`;

// What the account was told, newest first, each a link to where.
// The keyboard's place goes to the navigation as the list changes under it (Clear, a link followed): the button or the
// link is gone with the notice, and the focus would fall to the page.
function Notices({
  list,
  world,
  onClear,
  navRef,
}: Omit<NoticesProps, "said" | "saidId"> & { navRef: { current: HTMLElement | null } }) {
  const full = useFull();
  return (
    <Stack space="2xs" as="section">
      <Cluster space="xs" justify="between">
        <h2 className="label">Notifications</h2>
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
              title={noticeDone(whoIs(notice.by), notice.kind)}
              subtitle={notice.kind === "dm" ? "Direct message" : roomLabel(notice.where)}
              {...hrefProp(notice.kind === "dm" ? dmHref(world, notice.where, full) : roomHref(notice.where, full))}
            />
          </li>
        ))}
      </ul>
    </Stack>
  );
}

// A partner in a room the page follows, with nothing unread: the video's dot at the row's end (frame 56), said "online".
const ONLINE = { said: "online", status: true };

function Dms({
  world,
  partners,
  current,
  badges,
  notKept,
  present,
}: Pick<DmsProps, "world" | "partners" | "current" | "notKept" | "present"> & { badges: RoomsViewProps["badges"] }) {
  const full = useFull();
  const here = new Set(present?.split(" "));
  return (
    <Folding
      name="Direct messages"
      action={
        <IconButton
          icon="plus"
          label="New direct message"
          size="xs"
          onClick={() => {
            askFor("who-is-here");
          }}
        />
      }
    >
      {partners.length === 0 ? (
        // How to start one: a line close under the section's name, not a boxed card.
        <EmptyState look="inline" title="No direct messages yet" line="Pick someone in Who's here to start one." />
      ) : (
        <>
          <ul className={[shared["plain"], shared["items"]].join(" ")}>
            {partners.map((partner) => (
              <li key={partner}>
                <NavItem
                  href={dmHref(world, partner, full)}
                  current={partner === current}
                  lead={<Avatar address={partner} name={partner} size="s" decorative />}
                  badge={badged(badges?.[partner], true) ?? (here.has(partner) ? ONLINE : undefined)}
                >
                  {shortAddress(partner)}
                </NavItem>
              </li>
            ))}
          </ul>
          {/* What every direct message says of itself, in the video's small grey note under the list. */}
          <p className={styles["note"]}>
            {NOT_ENCRYPTED} {PAGE_ONLY}
          </p>
        </>
      )}
      {/* Said in view, not behind the menu: a device that kept none of the choices is a risk the reader must not miss (CR5). */}
      {notKept === true ? <p className={styles["note"]}>Not kept on this device</p> : null}
    </Folding>
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

export function RoomsView({ sections, current, dms, failed, badges, notices, media, saved }: RoomsViewProps) {
  const navRef = useRef<HTMLElement>(null);
  const listed = (
    <RoomsList sections={sections} current={current} failed={failed} badge={(room) => badged(badges?.[room])} />
  );
  const body =
    dms === undefined ? (
      listed
    ) : (
      <Stack space="l">
        {listed}
        <Dms {...dms} badges={badges} />
        {/* The reader's own shortcuts last, under a rule: the search first, the rooms, the conversations (Alexis, 2026-11-07). */}
        {saved === undefined && media === undefined ? null : (
          <div className={styles["saved"]}>
            {saved}
            {media}
          </div>
        )}
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
