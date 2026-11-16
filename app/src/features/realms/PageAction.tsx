// A `$help` link of the realm's own page as an action (D13502, core's withActions): a button that opens the call card prefilled with the
// link's arguments, once `vm/qfuncs` lists the function and every argument names one of its parameters; until then, and for any other, its
// words alone. The card is drawn apart from the paragraph (ActionCard), with the page's forms. No coins ever come from a link.
import { prefill, type HelpArg } from "@gnoworld/core";
import { Button } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useAppStore } from "../../storeContext.tsx";
import { InlineCard, openCard, type CallPlace } from "./InlineCard.tsx";
import { useCallable, writeOf } from "./useCallable.ts";

export function PageAction({
  id,
  func,
  args,
  place,
  label,
}: {
  id: string;
  func: string;
  args: readonly HelpArg[];
  place: CallPlace;
  label: ReactNode[];
}) {
  const store = useAppStore();
  const write = writeOf(useCallable(place.chain.rpc, place.realm, place.options), func);
  if (write === undefined || !args.every(({ name }) => write.fields.some((field) => field.name === name)))
    return <span>{label}</span>;
  return (
    <Button
      emphasis="outline"
      size="s"
      onClick={() => {
        openCard(store, { id, place, write: write.function, texts: prefill(write.fields, args) });
      }}
    >
      {label}
    </Button>
  );
}

/** The card an action `id` opens, under the page's forms: nothing until it is opened. */
export function ActionCard({ id, place, level }: { id: string; place: CallPlace; level: 2 | 3 | 4 }) {
  return <InlineCard id={id} place={place} level={level} />;
}
