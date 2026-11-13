import { installFramePump } from "./earthStage.ts";
import type { Page } from "./fixtures.ts";

// The skeletons' orientation, frame by frame (2026-11-11): each skeleton showing, where it stands, its gain and its world turn beside the
// turn of the drawn planet at that place, and which planets stand as themselves. `bonesTurns` reads it: the angle each skeleton turns
// between two frames, against the planet's own.
export type Quat = [number, number, number, number];
interface Bone {
  id?: string | undefined;
  at: [number, number, number];
  gain: number;
  q: Quat;
  planet?: Quat;
}
export interface BoneFrame {
  t: number;
  bones: Bone[];
  shown: number[];
  /** The camera's turn. */
  cam?: Quat;
}

/** Starts the sampler in the page; `stopBones` hands back its frames. */
export const recordBones = async (page: Page) => {
  await installFramePump(page);
  await page.evaluate(() => {
    const pumpFrames = Reflect.get(globalThis, "__pumpFrames") as (read: (t: number) => boolean) => void;
    interface Obj {
      type?: string;
      position?: { x: number; y: number; z: number };
      parent?: Obj | null;
      uuid?: string;
      renderOrder?: number;
      material?: { uniforms?: { uGain?: { value: number } } };
      quaternion?: { constructor: new () => { x: number; y: number; z: number; w: number } };
      getWorldQuaternion?: (into: { x: number; y: number; z: number; w: number }) => {
        x: number;
        y: number;
        z: number;
        w: number;
      };
    }
    interface Space {
      camera?: { quaternion: { x: number; y: number; z: number; w: number } };
      universe?: { systems: { planets: { index: number }[] }[] };
      stage?: {
        near?: { shows: (index: number) => boolean };
        scene?: { traverseVisible: (visit: (object: Obj) => void) => void };
      };
    }
    const ctl = { frames: [] as BoneFrame[], stop: false };
    Reflect.set(globalThis, "__bones", ctl);
    const turn = (object: Obj): Quat | undefined => {
      // three's own Quaternion, taken from the object's: the method needs one, not a plain record.
      const q =
        object.quaternion === undefined ? undefined : object.getWorldQuaternion?.(new object.quaternion.constructor());
      return q === undefined ? undefined : [q.x, q.y, q.z, q.w];
    };
    const camOf = (space: Space | undefined) => {
      const c = space?.camera?.quaternion;
      return c === undefined ? {} : { cam: [c.x, c.y, c.z, c.w] as Quat };
    };
    const read = (t: number) => {
      if (ctl.stop) return false;
      const space = Reflect.get(globalThis, "__gnoworldSpace") as Space | undefined;
      const [lines, groups]: [{ object: Obj; gain: number }[], Obj[]] = [[], []];
      space?.stage?.scene?.traverseVisible((object) => {
        const gain = object.material?.uniforms?.uGain?.value;
        if (object.renderOrder === -1 && gain !== undefined && object.parent?.parent != null)
          lines.push({ object, gain });
        else if (object.type === "Group" && object.position !== undefined) groups.push(object);
      });
      const bones = lines.flatMap(({ object, gain }) => {
        const root = object.parent;
        const q = turn(object);
        const at = root?.position;
        if (q === undefined || at === undefined) return [];
        const mate = groups.find(
          (each) =>
            each !== root &&
            each.position !== undefined &&
            Math.hypot(each.position.x - at.x, each.position.y - at.y, each.position.z - at.z) < 1e-3,
        );
        const planet = mate === undefined ? undefined : turn(mate);
        return [
          {
            id: root?.uuid,
            at: [at.x, at.y, at.z] as [number, number, number],
            gain,
            q,
            ...(planet === undefined ? {} : { planet }),
          },
        ];
      });
      const shown = (space?.universe?.systems ?? [])
        .flatMap((system) => system.planets)
        .filter(({ index }) => space?.stage?.near?.shows(index) === true)
        .map(({ index }) => index);
      ctl.frames.push({ t, bones, shown, ...camOf(space) });
      return true;
    };
    pumpFrames(read);
  });
};

export const stopBones = (page: Page) =>
  page.evaluate(() => {
    const ctl = Reflect.get(globalThis, "__bones") as { frames: BoneFrame[]; stop: boolean };
    ctl.stop = true;
    return ctl.frames;
  });

const angle = (a: Quat, b: Quat): number => {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
};
const near = (a: Bone, b: Bone): boolean => a.id === b.id;

interface Step {
  t: number;
  /** The turn of the skeleton as the eye sees it, in this frame. */
  seen: number;
  bone: number;
  planet: number | undefined;
  gap: number | undefined;
}

const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inverse = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
/** The skeleton as the eye sees it: its turn in the camera's frame. */
const seenBy = (cam: Quat | undefined, q: Quat): Quat => (cam === undefined ? q : mul(inverse(cam), q));

const stepOf = (pair: [Bone, Bone], t: number, cams: [Quat | undefined, Quat | undefined]): Step => {
  const [was, bone] = pair;
  return {
    t,
    seen: angle(seenBy(cams[0], was.q), seenBy(cams[1], bone.q)),
    bone: angle(was.q, bone.q),
    planet: was.planet && bone.planet ? angle(was.planet, bone.planet) : undefined,
    gap: bone.planet ? angle(bone.q, bone.planet) : undefined,
  };
};

/** Between two frames, for each skeleton standing still in both: the angle it turned (rad), the drawn planet's, and their gap in orientation. */
export function bonesTurns(frames: readonly BoneFrame[]) {
  const steps = frames.slice(1).flatMap((now, i) =>
    now.bones.flatMap((bone) => {
      const was = frames[i]?.bones.find((each) => near(each, bone));
      return was === undefined ? [] : [stepOf([was, bone], now.t, [frames[i]?.cam, now.cam])];
    }),
  );
  const gaps = steps.flatMap(({ gap }) => (gap === undefined ? [] : [gap]));
  return {
    steps: steps.length,
    worstBone: Math.max(0, ...steps.map(({ bone }) => bone)),
    worstSeen: Math.max(0, ...steps.map(({ seen }) => seen)),
    seenTop: [...steps]
      .sort((a, b) => b.seen - a.seen)
      .slice(0, 4)
      .map(({ t, seen, bone }) => ({ t: Math.round(t), seen, bone })),
    worstPlanet: Math.max(0, ...steps.map(({ planet }) => planet ?? 0)),
    gapRange: [Math.min(9, ...gaps), Math.max(0, ...gaps)],
    /** The five biggest turns of the skeleton in one frame. */
    top: [...steps]
      .sort((a, b) => b.bone - a.bone)
      .slice(0, 5)
      .map(({ t, bone, planet, gap }) => ({ t: Math.round(t), bone, planet, gap })),
    /** Steps where the skeleton turned over 0.05 rad more than the planet did. */
    jumps: steps
      .filter(({ bone, planet }) => bone - (planet ?? 0) > 0.05)
      .map(({ t, bone, planet }) => ({ t: Math.round(t), bone, planet })),
  };
}
