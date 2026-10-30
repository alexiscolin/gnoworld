/** A place as the list shows it: where it lives and the genres it has (none in the data files yet). */
export interface ListedPlace {
  slug: string;
  name: string;
  description: string;
  path: string;
  genres: string[];
}

/** The places that have any of the chosen genres, in their order; every place while none is chosen. */
export function filterByGenre(places: readonly ListedPlace[], chosen: readonly string[]): ListedPlace[] {
  return chosen.length === 0
    ? [...places]
    : places.filter((place) => place.genres.some((genre) => chosen.includes(genre)));
}
