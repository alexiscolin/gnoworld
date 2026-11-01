// A React root of the universe's own, under the page's, so it outlives the route that asked for it.
import { createRoot } from "react-dom/client";
import { Universe } from "./Universe.tsx";

/** Puts the universe on the page, and returns how to tell it whether the page shows it. */
export function mountUniverse(): (shown: boolean) => void {
  const box = document.createElement("div");
  document.body.append(box);
  const root = createRoot(box);
  return (shown) => {
    root.render(<Universe shown={shown} />);
  };
}
