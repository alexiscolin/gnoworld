import { Link } from "react-router";
import { pageMeta, WORLDS } from "../site.ts";

export function meta() {
  return pageMeta({
    title: "gno.world",
    description:
      "gno.world: the social, on-chain hub of gno.land, where its worlds, their rooms and their realms meet.",
    path: "/",
  });
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
