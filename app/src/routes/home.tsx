import { Link } from "react-router";
import { homeMeta, WORLDS } from "../site.ts";

export function meta() {
  return homeMeta();
}

export default function Home() {
  return (
    <>
      <h1>gno.world</h1>
      <ul>
        {WORLDS.map((world) => (
          <li key={world.slug}>
            <Link to={`/w/${world.slug}`}>{world.name}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
