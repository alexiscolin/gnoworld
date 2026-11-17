import type { ReactElement, ReactNode } from "react";
import { ErrorView, errorKind } from "../../errors/index.ts";
import { chunked } from "../Failing.tsx";
import { asDrawer } from "./RoomsList.tsx";
import type { WorldsProps } from "../Worlds.tsx";

// The rooms of a narrow chat (a dock's, a phone's) sit behind a control and a drawer, whose code is asked once the box is
// narrow: a wide one never carries it (the first screen's budget, ADR-0001 §12). A chunk that cannot be fetched leaves a
// notice that the rooms could not load.
const RoomsDrawer = chunked(async () => ({ default: (await import("../phone/RoomsDrawer.tsx")).RoomsDrawer }), {
  waiting: null,
  failed: (error) => <ErrorView kind={errorKind(error)} size="inline" urgent />,
});

// The narrow full chat's rooms: the worlds join them in the drawer on a phone (the window under 900 px) alone, and its list looks as a
// drawer's does (RoomsList.tsx; set here, so the drawer's own code shares none of the list's).
export const roomsOf = (
  props: { unread: number; rail: ReactElement; phone: boolean; modes: ReactNode },
  rows: WorldsProps,
) => (
  <RoomsDrawer
    {...props}
    rail={props.phone ? asDrawer(props.rail) : props.rail}
    worlds={props.phone ? rows : undefined}
  />
);
