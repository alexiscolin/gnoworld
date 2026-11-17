// gnosh's colony's rooms on its hull, as the Earth's side rooms on its ground (data/earthRooms.json): each by the direction of its hull's
// normal at its room's point (space/colony/crown.ts's ROOM_ANCHORS), so the ground stands its pin there and nowhere else (D13745).
const DEGREE = 180 / Math.PI;

/** The colony's rooms and where each is pinned, in degrees: the main room on the wheel, #help across it, #showcase on the hub. */
export const COLONY_ROOMS: readonly { readonly room: string; readonly lat: number; readonly lon: number }[] = [
  { room: "#gnosh-ai", lat: 0.9 * DEGREE, lon: -0.55 * DEGREE },
  { room: "#gnosh-ai/help", lat: 0.9 * DEGREE, lon: -2.35 * DEGREE },
  { room: "#gnosh-ai/showcase", lat: 0, lon: -0.1 * DEGREE },
];

/** The rooms pinned on the world `id`: the colony's; none on a planet. */
export const roomsOn = (id: string): typeof COLONY_ROOMS => (id === "gnosh-ai" ? COLONY_ROOMS : []);
