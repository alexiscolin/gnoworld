import { Link } from "react-router";
import { homeMeta, worldPath, WORLDS } from "../site.ts";

export const meta = homeMeta;

export default function Home() {
  return (
    <>
      <h1>gno.world</h1>
      <ul>
        {WORLDS.map((world) => (
          <li key={world.slug}>
            <Link to={worldPath(world)}>{world.name}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
