// The stations: their switch, and the one shown whatever it says.

/** The one switch for the stations round the Earth. Off: the scene draws none, the hubs of kind "station" are not offered as places, and a direct URL still opens their page. */
export const STATIONS_SHOWN = false as boolean;

/** The stations shown whatever the switch says: gnosh's colony, on its own orbit round gno.land's sun (D13742). */
export const SHOWN_STATIONS: readonly string[] = ["gnosh-ai"];
