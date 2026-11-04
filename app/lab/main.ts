// The lab's door: the cosmos is the site's own scene on a canvas of its own, and a canvas takes one renderer, so a view chooses at the start.
import "@gnoworld/ui/styles.css";
import "./lab.css";

const view = new URLSearchParams(location.search).get("view");
const start =
  view === "cosmos" ? import("./cosmos.ts") : view === "particles" ? import("./particles.ts") : import("./realism.ts");
start.catch((error: unknown) => {
  throw error;
});
