// A world's thumb: the picture the scene took of its planet, else the planet drawn from its seed once it is, else `fallback`.
import { PlanetThumb, type PlanetThumbProps } from "@gnoworld/ui";
import { useWorldPicture } from "./worldThumbs.ts";

export function WorldPlanet({
  world,
  fallback,
  ...thumb
}: { world: string; fallback: string } & Omit<PlanetThumbProps, "src">) {
  const { ref, src } = useWorldPicture(world);
  return (
    <span ref={ref} style={{ display: "contents" }}>
      <PlanetThumb src={src ?? fallback} {...thumb} />
    </span>
  );
}
