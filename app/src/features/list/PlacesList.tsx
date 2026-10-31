import { Button, Chip, Cluster, PlanetThumb, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router";
import styles from "./PlacesList.module.css";
import { filterByGenre, type ListedPlace } from "./filter.ts";

/** The places as the prototype's cards (#board's .hubcard), each a link to its page, with a toggle per genre: a native button, so the keyboard reaches it. */
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
        <ul aria-label="Places" className={styles["cards"]}>
          {shown.map((place) => (
            <li key={place.path}>
              {/* No capture exists yet: the drawn fallback, never a picture from elsewhere. */}
              <Link to={place.path} className={styles["card"]}>
                <span className={styles["head"]}>
                  <PlanetThumb src="" name={place.name} size="m" decorative />
                  <span className={styles["words"]}>
                    <span className={styles["name"]}>{place.name}</span>
                    <span className={styles["description"]}>{place.description}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}

/** The list's board: on a computer, the prototype's #board, a box of its own over the page from 98 px under the top to 24 px
 * over the foot; on a phone, the page itself. */
export function Board({ children }: { children: ReactNode }) {
  return (
    <div className={styles["board"]}>
      <Stack>{children}</Stack>
    </div>
  );
}
