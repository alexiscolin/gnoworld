// The place's main action, its words on the solid button: the same on a computer's row (Actions.tsx) and a phone's (PhoneActions.tsx).
import { Button } from "@gnoworld/ui";
import type { ActionsProps } from "./Actions.tsx";

export function MainAction({ main }: { main: NonNullable<ActionsProps["lead"]> }) {
  return (
    <Button href={main.href} pad="wide" emphasis="solid" icon={main.icon ?? "arrow"}>
      {main.label}
    </Button>
  );
}
