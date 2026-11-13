// An action pinned by the team or proposed by Jarvis, as a Form block (9e, ADR-0002 section 4, "Proposed actions"): checked against
// `vm/qfuncs` before anything shows, the function, its types and the names of its arguments, so a planted message forges no button.
// A confirmed one shows its why and a "Call" that opens the call card prefilled, every field editable; anything else shows nothing.
// In the chat (`viewHref`), a call of more than two fields is only a compact card with its way to the realm view (ADR-0002 section 4).
// In the chat's quick actions bar (`bar`, D271) it is one pill that opens the bar's own card, or a link to the realm view.
import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { HIDDEN, type FormField } from "@gnoworld/core";
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { useAppStore } from "../../storeContext.tsx";
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

function fieldOf(name: string, value: string): FormField {
  return { tag: "input", name, inputType: "", value, placeholder: "", description: "", flags: "" };
}

// The function the action calls, and its texts and fields, when the chain confirms it: a write a call carries, every argument named for a parameter.
function confirmed(listing: Listing, { function: name, args }: ProposedCall, exact: boolean) {
  const write = writeOf(listing, name);
  if (write === undefined || !Object.keys(args).every((arg) => write.fields.some((field) => field.name === arg)))
    return undefined;
  // Jarvis's proposal names every parameter, as the server's check does (D225, D226): one left out is none.
  if (exact && write.fields.length !== Object.keys(args).length) return undefined;
  // Own keys only (a Map of the entries): a parameter the realm calls `constructor` must not find the object's own function.
  const given = new Map(Object.entries(args));
  const fields = write.fields.map((field) => fieldOf(field.name, given.get(field.name) ?? ""));
  return { write, texts: fields.map(({ value }) => value), fields };
}

// Jarvis's words, set left to right, as text and nothing else: a reason holding a control or format character (a bidi override
// draws reversed inside an isolate too) is not drawn at all; the card below says the true realm, function and arguments.
function Why({ text }: { text: string | undefined }) {
  return text === undefined || text === "" || HIDDEN.test(text) ? null : <p dir="ltr">{text}</p>;
}

// The bar's pill, its look the bar's: a link to the realm view for a call of more than two fields (`href`), else a button that
// opens its card.
function BarPill({ href, onClick, children }: { href: string | undefined; onClick: () => void; children: ReactNode }) {
  return href === undefined ? (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ) : (
    <Link to={href}>{children}</Link>
  );
}

/** The action for the chain `place` names (its realm is the action's own). */
export function ActionForm({
  action,
  label,
  chain,
  options,
  viewHref,
  bar,
  exact = false,
}: {
  action: ProposedCall;
  label?: string;
  chain: CallPlace["chain"];
  options?: CallPlace["options"];
  viewHref?: string;
  /** In the quick actions bar: the card the bar draws, which the pill opens. */
  bar?: { card: string };
  /** Every parameter of the function is named: what a proposal of Jarvis is held to. */
  exact?: boolean;
}) {
  const store = useAppStore();
  const place: CallPlace = { realm: action.realm, chain, options };
  const listing = useCallable(chain.rpc, action.realm, options);
  const id = `${chain.chainId} ${action.realm}.${action.function}#${useId()}`;
  const checked = confirmed(listing, action, exact);
  if (checked === undefined) return null;
  const { write, texts, fields } = checked;
  const compact = viewHref !== undefined && fields.length > 2;
  const open = (card: string) => {
    openCard(store, { id: card, place, write: write.function, texts });
  };
  const name = label ?? (
    <>
      Call
      <span className="visually-hidden"> {write.function.name}</span>
    </>
  );
  if (bar !== undefined)
    return (
      <BarPill
        href={compact ? viewHref : undefined}
        onClick={() => {
          open(bar.card);
        }}
      >
        {name}
      </BarPill>
    );
  return (
    <>
      <RealmForm
        exec={write.function.name}
        path=""
        fields={fields}
        left={0}
        note={compact ? "a call of more fields, made in the realm view" : "a call you sign in Adena"}
      >
        <Stack space="xs">
          <Why text={action.why} />
          <Cluster justify="end">
            {compact ? (
              <Button emphasis="outline" size="s" href={viewHref}>
                Open in the realm view
              </Button>
            ) : (
              <Button
                emphasis="outline"
                size="s"
                onClick={() => {
                  open(id);
                }}
              >
                {name}
              </Button>
            )}
          </Cluster>
        </Stack>
      </RealmForm>
      {compact ? null : <InlineCard id={id} place={place} title={label} />}
    </>
  );
}
