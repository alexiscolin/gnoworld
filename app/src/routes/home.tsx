import { Link } from "react-router";
import { PageError } from "../features/errors/index.ts";
import { homeMeta } from "../meta.ts";
import { worldPath, WORLDS } from "../places.ts";

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

// Every route catches its own errors (docs/ARCHITECTURE.md; F329); the app may be what failed, so the
// way home loads the document again (F325).
export function ErrorBoundary() {
  return <PageError title="The universe could not load" line="Try again in a moment." reload />;
}
