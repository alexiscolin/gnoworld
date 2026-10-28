// An account's chat on a world's page (slice 4): the direct messages and what the account was told, drawn with the
// rooms. Its code is an account's alone, asked once the session is one (ADR-0001 §12; docs/decisions.md, 2026-10-27).
import type { RoomList } from "@gnoworld/schemas";
import { useDms } from "./Dms.tsx";
import { Loaded, type LoadedProps } from "./Loaded.tsx";
import { LOADING } from "./Loading.tsx";
import { useNotices } from "./useNotices.ts";

export interface AccountChatProps extends Omit<LoadedProps, "sections" | "dms" | "noticing"> {
  /** Whether the rooms came, or could not. */
  loaded: boolean;
  world: string;
  /** The rooms as the server listed them; none when they could not load. */
  sections: RoomList["sections"] | undefined;
  /** The address's ?dm=. */
  dm: string | null;
}

export function AccountChat({ loaded, world, sections, dm, ...page }: AccountChatProps) {
  const { session, current, link, failed } = page;
  const dms = useDms(world, session, dm);
  const noticing = useNotices({
    world,
    session,
    sections,
    dms,
    current,
    read: (room, time) => link.current?.markRead(room, time),
  });
  if (!loaded) return LOADING;
  // A direct message waits on no room: it shows though the rooms could not load (U10).
  if (failed !== undefined && dms.partner === undefined) return failed;
  return <Loaded {...page} sections={sections ?? []} dms={dms} noticing={noticing} />;
}
