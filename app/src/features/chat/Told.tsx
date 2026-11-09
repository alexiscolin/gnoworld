import { Flash, type FlashMessage } from "@gnoworld/ui";

// What Ergo refused, said until the page dismisses it: a delete first, then a reaction; none, the page's own word.
const toldOf = (refused: string | undefined, cannotReact: true | undefined): FlashMessage | undefined => {
  if (refused !== undefined) return { title: "Could not delete the message.", line: "The chat refused it." };
  return cannotReact === undefined ? undefined : { title: "Could not react." };
};

// The flash: what Ergo refused, else the page's own word; closing it dismisses the refusal, or forgets the word.
interface ToldProps {
  refused: string | undefined;
  cannotReact: true | undefined;
  said: FlashMessage | null;
  setSaid: (said: FlashMessage | null) => void;
  onDismiss: () => void;
}

export function Told({ refused, cannotReact, said, setSaid, onDismiss }: ToldProps) {
  const told = toldOf(refused, cannotReact);
  return (
    <Flash
      message={told ?? said}
      onClose={() => {
        if (told === undefined) setSaid(null);
        else onDismiss();
      }}
    />
  );
}
