// The full chat's info panel as the screen fills it: the place, who talks, the countries declared and
// the links out.
import type { ReactNode, RefObject } from "react";
import universes from "../../../data/universes.json" with { type: "json" };
import type { ChatScreenProps } from "./ChatScreen.tsx";
import { realmPath } from "../../places.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { PlaceInfo } from "./PlaceInfo.tsx";
import { PlaceView } from "./PlaceView.tsx";
import { CountriesFigure, Links } from "./PlaceMore.tsx";

// The place on its universe's gnoweb: its realm's page, else gnoweb itself (the Earth, a world with no realm).
const gnowebOf = ({ universe: { gnoweb }, realms, realm: own }: ChatPlace): string | undefined => {
  const realm = own ?? realms?.[0];
  return gnoweb === undefined || realm === undefined ? gnoweb : `${gnoweb}${realmPath(realm)}`;
};

export function Info({
  place,
  talking,
  room,
  people,
  panelRef,
  buttons,
  close,
  page,
}: Pick<ChatScreenProps, "place" | "talking" | "people"> & {
  /** The place's buttons, in the planet's bar (PlaceView.tsx). */
  buttons: ReactNode;
  /** What closes the full chat, at the bar's right (FullButton.tsx); none where the chat cannot be closed. */
  close: ReactNode;
  /** The control that opens the place's own page (PlaceSheet.tsx), where the page is not beside the chat. */
  page?: ReactNode;
  room: ChatScreenProps["here"];
  panelRef: RefObject<HTMLElement | null>;
}) {
  return (
    <PlaceInfo
      view={<PlaceView place={place} buttons={buttons} close={close} />}
      kicker={place.kicker}
      name={place.name}
      description={place.description}
      talking={talking}
      countries={room === undefined ? undefined : <CountriesFigure lines={room.lines} members={room.members} />}
      links={<Links gnoweb={gnowebOf(place)} chainId={universes.find(({ id }) => id === place.universe.id)?.chainId} />}
      page={page}
      here={people}
      panelRef={panelRef}
    />
  );
}
