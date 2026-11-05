// A page's `<gno-form exec="Func">` that a call can carry (9e, ADR-0002 section 4): the form as RealmForm draws it, every field in
// view, and a "Call" that opens the call card under it, prefilled from the form, every field editable (a hidden one shows as a field,
// the form still says it is hidden), the card after the form's frame and not inside it (a frame of its own, the column's width). What the chain does not confirm leaves the read-only form: `vm/qfuncs` has no such write
// function, a type no call carries, a field no parameter is named for, two of one name, a line that is no field, fields left
// out of the drawing, or a `path`, which names the realm gnoweb sends to and which this form does not follow.
import type { CallField, FormField } from "@gnoworld/core";
import { Button, Cluster } from "@gnoworld/ui";
import { useId } from "react";
import { useAppStore } from "../../storeContext.tsx";
import { InlineCard, openCard, type CallPlace } from "./InlineCard.tsx";
import { RealmForm } from "./RealmForm.tsx";
import { useCallable, writeOf, type Listing } from "./useCallable.ts";

// The text for each of the function's fields, or none when the form is not one this function's call can be prefilled from.
function textsOf(fields: readonly CallField[], form: readonly FormField[]): string[] | undefined {
  const names = new Set(fields.map(({ name }) => name));
  const seen = new Set<string>();
  for (const { name } of form) {
    // A line that is no field (`other`) has no name.
    if (name === "" || !names.has(name) || seen.has(name)) return undefined;
    seen.add(name);
  }
  return fields.map(({ name }) => form.find((each) => each.name === name)?.value ?? "");
}

// The function and the texts a Call opens its card with, when the chain confirms the form.
function prefill(listing: Listing, exec: string, form: readonly FormField[]) {
  const write = writeOf(listing, exec);
  if (write === undefined) return undefined;
  const texts = textsOf(write.fields, form);
  return texts === undefined ? undefined : { write: write.function, texts };
}

/** The form of a page for the realm `call` names. */
export function CallableForm({
  exec,
  path,
  fields,
  left,
  call,
}: {
  exec: string;
  path: string;
  fields: readonly FormField[];
  left: number;
  call: CallPlace;
}) {
  const store = useAppStore();
  const listing = useCallable(call.chain.rpc, call.realm, call.options);
  // A card of its own for each form: two forms of one function, or a form and a row, never share one.
  const id = `${call.chain.chainId} ${call.realm}.${exec}#${useId()}`;
  const prefilled = path === "" && left === 0 ? prefill(listing, exec, fields) : undefined;
  if (prefilled === undefined) return <RealmForm exec={exec} path={path} fields={fields} left={left} />;
  return (
    <>
      <RealmForm exec={exec} path={path} fields={fields} left={left} note="a call you sign in Adena">
        <Cluster justify="end">
          <Button
            emphasis="outline"
            size="s"
            onClick={() => {
              openCard(store, { id, place: call, ...prefilled });
            }}
          >
            Call
            <span className="visually-hidden"> {exec}</span>
          </Button>
        </Cluster>
      </RealmForm>
      <InlineCard id={id} place={call} />
    </>
  );
}
