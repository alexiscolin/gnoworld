// The hubs that list no realm, so the worlds' file has none of their worlds (it is made of realms): laid out from the start, each a system of
// its own, so a flight to one's page lays nothing again. Apart from stationWorlds.ts, which the colony's picture is made from: a hub listed
// is no change of any look.
import type { CosmosWorld } from "./cosmosWorld.ts";

export const HUB_WORLDS: readonly CosmosWorld[] = [{ id: "bubble", namespace: "bubble", realms: [] }];
