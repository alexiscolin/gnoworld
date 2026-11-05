// An action pinned by the team or proposed by Jarvis, as a Form block (9e, ADR-0002 section 4, "Proposed actions"): checked against
// `vm/qfuncs` before anything shows, the function, its types and the names of its arguments, so a planted message forges no button.
// A confirmed one shows its why and a "Call" that opens the call card prefilled, every field editable; anything else shows nothing.
// In the chat (`viewHref`), a call of more than two fields is only a compact card with its way to the realm view (ADR-0002 section 4).
import { useId } from "react";
import { HIDDEN, type FormField } from "@gnoworld/core";
import { Button, Stack } from "@gnoworld/ui";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { callsIn } from "../calls/index.ts";
import { RealmForm } from "./RealmForm.tsx";
import { InlineCard, openCard, type CallPlace } from "./InlineCard.tsx";
import { useCallable, writeOf, type Listing } from "./useCallable.ts";

export interface ProposedCall {
  realm: string;
  function: string;
  /** The text of each argument by the parameter's name. */
  args: Readonly<Record<string, string>>;
  why?: string | undefined;
}

const fieldOf = (name: string, value: string): FormField => ({
  tag: "input",
  name,
  inputType: "",
  value,
  placeholder: "",
  description: "",
  flags: "",
});

// The function the action calls, and its texts and fields, when the chain confirms it: a write a call carries, every argument named for a parameter.
function confirmed(listing: Listing, { function: name, args }: ProposedCall) {
  const write = writeOf(listing, name);
  if (write === undefined || !Object.keys(args).every((arg) => write.fields.some((field) => field.name === arg)))
    return undefined;
  // Own keys only: a parameter the realm calls `constructor` must not find the object's own function.
  const texts = write.fields.map((field) => (Object.hasOwn(args, field.name) ? (args[field.name] ?? "") : ""));
  return { write, texts, fields: write.fields.map((field, index) => fieldOf(field.name, texts[index] ?? "")) };
}

// Jarvis's words, set left to right, as text and nothing else: a reason holding a control or format character (a bidi override
// draws reversed inside an isolate too) is not drawn at all; the card below says the true realm, function and arguments.
const Why = ({ text }: { text: string | undefined }) =>
  text === undefined || text === "" || HIDDEN.test(text) ? null : <p dir="ltr">{text}</p>;

/** The action for the chain `place` names (its realm is the action's own). */
export function ActionForm({
  action,
  label,
  chain,
  options,
  viewHref,
}: {
  action: ProposedCall;
  label?: string;
  chain: CallPlace["chain"];
  options?: CallPlace["options"];
  viewHref?: string;
}) {
  const store = useAppStore();
  const place: CallPlace = { realm: action.realm, chain, ...(options === undefined ? {} : { options }) };
  const listing = useCallable(chain.rpc, action.realm, options);
  const id = `${chain.chainId} ${action.realm}.${action.function}#${useId()}`;
  const opened = useApp((state) => callsIn(state)?.calls[id] !== undefined);
  const checked = confirmed(listing, action);
  if (checked === undefined) return null;
  const { write, texts, fields } = checked;
  const compact = viewHref !== undefined && fields.length > 2;
  return (
    <RealmForm
      exec={write.function.name}
      path=""
      fields={fields}
      left={0}
      note={compact ? "a call of more fields, made in the realm view" : "a call you sign in Adena"}
    >
      <Stack space="xs">
        <Why text={action.why} />
        {compact ? (
          <Button emphasis="outline" size="s" href={viewHref}>
            Open in the realm view
          </Button>
        ) : (
          <Button
            emphasis="outline"
            size="s"
            onClick={() => {
              openCard(store, { id, place, write: write.function, texts });
            }}
          >
            {label ?? `Call ${write.function.name}`}
          </Button>
        )}
        {opened && !compact ? <InlineCard id={id} place={place} /> : null}
      </Stack>
    </RealmForm>
  );
}
