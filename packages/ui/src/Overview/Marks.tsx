import { Badge } from "../Badge/Badge.tsx";
import { Cluster } from "../compositions/index.ts";
import { Stamp } from "../Stamp/Stamp.tsx";

/** The two marks of the passport: a visit's stamp, a challenge's badge. */
export function Marks() {
  return (
    <Cluster space="m">
      <Stamp seed="games/chess" name="chess" day="11 Nov" system="games" icon="play" />
      <Stamp seed="gnoland/smoke" name="smoke" day="7 Nov" system="gnoland" gold />
      <Badge name="Named" icon="at" tone="mine" earned />
      <Badge name="Player one" icon="play" tone="signal" earned={false} count="1/4" />
    </Cluster>
  );
}
