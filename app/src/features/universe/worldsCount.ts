// How many worlds the cosmos draws (slice 7d6), which the first screen's hero says. The home reads it from the count the server writes beside
// the worlds' file (7n2), a few bytes on phones and computers alike; the scene's read of the file says what it draws, and that count stands.
// Apart from the scene's chunk, so the door and the chunk it opens do not import each other.
import { useEffect, useState } from "react";
import { readWorldsCount } from "../../lib/chain/worldsCount.ts";
import { drawnNow, useWorldsDrawn, worldsDrawn } from "./worldsDrawn.ts";

export { useWorldsDrawn, worldsDrawn };

// The count's read under way, whoever asked it; one that brought nothing is let go, for the next home to ask again. Out of the hook: the
// React Compiler refuses a hook that writes a module's variable, even from its effect.
let reading: Promise<void> | undefined;

function ask(): Promise<void> {
  reading ??= readWorldsCount(import.meta.env.BASE_URL).then((file) => {
    if (file === undefined) reading = undefined;
    else if (drawnNow() === undefined) worldsDrawn(file.count);
  });
  return reading;
}

/** How many worlds the cosmos draws, while `wanted`: the page reads their count once a visit, whether the scene runs or not. Nothing while it
 * comes; null once this page's read has ended with none known, until a read brings it. A read that brought one has told the store first. */
export function useWorldsCount(wanted: boolean): number | null | undefined {
  const count = useWorldsDrawn();
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    if (wanted && count === undefined)
      ask().then(
        () => {
          setEnded(true);
        },
        () => undefined,
      );
  }, [wanted, count]);
  if (!wanted) return undefined;
  return count ?? (ended ? null : undefined);
}
