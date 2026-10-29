import { Button, Chip, Cluster, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { filterByGenre, type ListedPlace } from "./filter.ts";

/** The places, as links to their pages, with a toggle per genre: a native button, so the keyboard reaches it. */
export function PlacesList({ places, genres }: { places: ListedPlace[]; genres: { slug: string; name: string }[] }) {
  const [chosen, setChosen] = useState<string[]>([]);
  if (places.length === 0) return <p>No place yet.</p>;
  const shown = filterByGenre(places, chosen);
  const toggle = (slug: string) => {
    setChosen((now) => (now.includes(slug) ? now.filter((each) => each !== slug) : [...now, slug]));
  };
  return (
    <Stack>
      {genres.length === 0 ? null : (
        <div role="group" aria-label="Genres">
          <Cluster space="2xs">
            {genres.map((genre) => (
              <Chip
                key={genre.slug}
                selected={chosen.includes(genre.slug)}
                onClick={() => {
                  toggle(genre.slug);
                }}
              >
                {genre.name}
              </Chip>
            ))}
          </Cluster>
        </div>
      )}
      {shown.length === 0 ? (
        <Stack space="xs">
          <p>No place of this genre.</p>
          <Cluster>
            <Button
              onClick={() => {
                setChosen([]);
              }}
            >
              Clear the filter
            </Button>
          </Cluster>
        </Stack>
      ) : (
        <ul aria-label="Places">
          {shown.map((place) => (
            <li key={place.path}>
              <Button href={place.path} emphasis="quiet">
                {place.name}
              </Button>
              <p>{place.description}</p>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
