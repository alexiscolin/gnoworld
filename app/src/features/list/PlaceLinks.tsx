import { Link } from "react-router";

/** Places as links to their pages, one a line. */
export function PlaceLinks({ places }: { places: readonly { name: string; path: string }[] }) {
  return (
    <ul>
      {places.map((place) => (
        <li key={place.path}>
          <Link to={place.path}>{place.name}</Link>
        </li>
      ))}
    </ul>
  );
}
