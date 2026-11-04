// The gauges and what a later slice brings (slice 8), on the overview.
import { ComingSoon } from "../ComingSoon/ComingSoon.tsx";
import { Cluster } from "../compositions/index.ts";
import { Progress } from "../Progress/Progress.tsx";

export function Soon() {
  return (
    <Cluster space="xl">
      <Progress label="Passport, DeFi" value={3} max={5} kind="steps" shown="3/5" />
      <Progress label="Passport" value={3} max={19} shown="3/19" />
      <ComingSoon name="Jarvis" icon="spark" words="Jarvis" />
      <ComingSoon name="Notifications" icon="bell" />
    </Cluster>
  );
}
