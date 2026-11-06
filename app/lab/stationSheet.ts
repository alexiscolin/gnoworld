// The lab's sheet of stations (part 7x): the sample's twenty, each alone in its cell, at sizes spread from a satellite to an artificial
// world, named under; the study's spread, not a sign.
import { stationOf } from "@gnoworld/core";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { StationsDrawn } from "../src/scene/station/stations.ts";
import { lightsOf } from "../src/scene/station/shapes.ts";
import { pin, SAMPLE, studyView } from "./earthParts.ts";
import { starField } from "./sky.ts";
import type { Device, View } from "./views.ts";

/** The sheet: the sample's twenty stations, each alone in its cell, at sizes from a satellite to an artificial world, named under. */
export function stationSheet({ ratio }: Device): View {
  const stage = new Scene();
  const camera = new PerspectiveCamera(30, 1.6, 0.1, 6000);
  camera.position.set(0, 0, 21);
  stage.add(starField(ratio));
  stage.add(...lightsOf(new Vector3(1, 0.6, 0.8)));
  const stations = new StationsDrawn();
  const cell = (index: number) => new Vector3(((index % 5) - 2) * 2.5, (1.5 - Math.floor(index / 5)) * 2.6, 0);
  stations.stand(
    SAMPLE.map((seed, index) => ({
      station: stationOf(seed, index / (SAMPLE.length - 1)),
      at: cell(index),
      radius: 1.05,
    })),
  );
  stage.add(stations.group);
  const names = SAMPLE.map((seed, index) => {
    const label = Object.assign(document.createElement("span"), {
      textContent: `${seed} · ${(index / (SAMPLE.length - 1)).toFixed(2)}`,
    });
    label.className = "sheet-name";
    document.body.append(label);
    return label;
  });
  Reflect.set(globalThis, "__earthSystem", { parts: stations.stats() });
  return studyView(
    { stage, camera },
    {
      looked() {
        camera.updateMatrixWorld();
        names.forEach((label, index) => {
          pin(label, cell(index).add(new Vector3(0, -1.2, 0)), camera);
        });
      },
      tick(seconds) {
        stations.tick(seconds);
      },
      dispose() {
        stations.dispose();
        for (const label of names) label.remove();
      },
    },
  );
}
