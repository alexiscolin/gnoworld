// A second engine on a small canvas of its own (the full chat's planet): the same code as the page's space, drawn at a world's planet or
// from above (the Map); it draws while mounted, and what unmounts it ends its loop and frees its context.
import { useEffect, useRef } from "react";
import type { Space } from "./space/scene.ts";
import { type groundOn } from "./earthGround.ts";
import { motionOf } from "./space/motion.ts";
import { nameOf } from "./placeName.ts";
import { gpuCanDraw } from "./features/universe/gpu.ts";
import { worldsFile } from "./features/universe/worldsFile.ts";
import styles from "./MiniSpace.module.css";

// raw: the planet's circle in the box, a share of its shorter side: the planet, and from above the system's outer orbit, fill it
const FILL = 0.36;

const nothing = () => undefined;
// Outside the component: the React Compiler cannot lower an import expression.
const loadEngine = () => import("./space/scene.ts");

/** The world `world`'s planet, or its system from above where `map`; `ground` (the Earth's signs') is handed the engine while it runs. */
export default function MiniSpace({
  world,
  map,
  ground,
}: {
  world: string;
  map: boolean;
  ground: ReturnType<typeof groundOn>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<Space>(undefined);
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
    spaceRef.current?.view(map);
  }, [map]);
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || !gpuCanDraw()) return;
    const canvas = Object.assign(document.createElement("canvas"), { className: styles["canvas"] ?? "" });
    const labels = Object.assign(document.createElement("div"), { className: styles["labels"] ?? "" });
    host.append(canvas, labels);
    const leaving = new AbortController();
    const hold = () => {
      const { clientWidth: width, clientHeight: height } = canvas;
      if (height === 0) return;
      spaceRef.current?.hold({ x: width / 2, y: height / 2, radius: Math.min(width, height) * FILL, width, height });
    };
    const sized = new ResizeObserver(hold);
    sized.observe(canvas);
    loadEngine()
      .then(async ({ Space: Engine }) => {
        const file = await worldsFile();
        if (leaving.signal.aborted || file === undefined) return;
        const space = new Engine({
          canvas,
          labels,
          base: import.meta.env.BASE_URL,
          still: () => motionOf().matches,
          name: nameOf,
          inChat: true,
          events: {
            world: nothing,
            system: nothing,
            universe: nothing,
            near: nothing,
            landed: nothing,
            drawn: () => {
              canvas.classList.add(styles["drawn"] ?? "");
            },
          },
        });
        spaceRef.current = space;
        ground.attach(space);
        space.view(mapRef.current);
        hold();
        space.worlds(file.worlds);
        space.go({ kind: "world", id: world });
      })
      .catch(reportError);
    return () => {
      leaving.abort();
      sized.disconnect();
      ground.attach(undefined);
      spaceRef.current?.dispose();
      spaceRef.current = undefined;
      canvas.remove();
      labels.remove();
    };
  }, [world, ground]);
  return <div ref={hostRef} className={styles["host"]} />;
}
