import { Link } from "react-router";
import { homeMeta } from "../meta.ts";
import { worldPath, WORLDS } from "../worlds.ts";

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
