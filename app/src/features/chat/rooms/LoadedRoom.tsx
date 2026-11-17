import type { ReactNode } from "react";
import { NoRoomYet, RoomView, type RoomViewOver } from "../lines/RoomView.tsx";
import type { Shown } from "./roomShown.ts";

/** The conversation in view: a direct message's problem, said in the room's place, then the room with its composer; the rooms that could not load, said where no room is. */
export function LoadedRoom({
  problem,
  shown,
  view,
  composer,
  failed,
}: {
  problem: ReactNode;
  shown: Shown | undefined;
  view: RoomViewOver;
  composer: ReactNode;
  failed: ReactNode;
}) {
  const room = shown && <RoomView key={shown.key} {...shown.view} {...view} composer={composer} />;
  return (
    <>
      {problem === undefined ? null : <p role="status">{problem}</p>}
      {room ?? (problem === undefined ? <NoRoomYet failed={failed} /> : null)}
    </>
  );
}
