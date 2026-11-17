// An answer of Jarvis as a card, among the chat's lines: "AI CONCIERGE", violet, "AI · may be wrong". Its Markdown is drawn through
// core's chat reader and the chat's own drawing, no image and no HTML; a link on gnoweb or the app's own origin is an anchor, any other is
// a button behind the leaving warning. Its buttons: fly goes to a place; an action opens the call card only once vm/qfuncs lists its
// function with exactly its arguments' names, never coins, and only on the chain it was checked on (otherwise a short line). A label with a hidden character draws no button: its words are a machine's.
import type { ReadOptions } from "@gnoworld/chain/read";
import { holdsHidden, type AnswerButton, type JarvisAnswer } from "@gnoworld/schemas";
import { Button, Card, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { ActionForm, useExternalLinks, type CallPlace } from "../realms/index.ts";

type Answered = Extract<JarvisAnswer, { status: "answered" }>;

/** An answer's Markdown as elements, drawn by the chat's own drawing; `link` draws a link itself, or `undefined` for the usual anchor. */
export type DrawMarkdown = (text: string, link: (href: string, label: ReactNode[]) => ReactNode) => ReactNode[];

export interface AnswerCardProps {
  /** The answer's own identity (its room and line, or its ask): its call cards are its own, not another answer's holding the same action. */
  id: string;
  answer: Answered;
  /** Who asked, by short address, when the room is shown another person's answer. */
  asker?: string;
  chain: CallPlace["chain"];
  options?: ReadOptions | undefined;
  /** The chain's gnoweb and the app's own origin: links there are anchors. */
  gnoweb: string | undefined;
  own: string;
  /** The chat's drawing of Markdown. */
  draw: DrawMarkdown;
  onFly: (place: string) => void;
}

function Action({
  id,
  button,
  chain,
  options,
  onFly,
}: Pick<AnswerCardProps, "id" | "chain" | "options" | "onFly"> & { button: AnswerButton }) {
  // The check ran on the chain the button carries: on another network the card never opens, and the person is told.
  if (button.type === "action" && button.chainId !== chain.chainId)
    return (
      <p className="meta">{`"${button.label}" was checked on ${button.chainId}: it runs there, not on ${chain.chainId}.`}</p>
    );
  if (button.type === "action")
    return (
      <ActionForm
        exact
        cardId={`answer ${id} action ${JSON.stringify(button.action)}`}
        action={button.action}
        label={button.label}
        chain={chain}
        options={options}
      />
    );
  return (
    <Button
      onClick={() => {
        onFly(button.place);
      }}
    >
      {button.label}
    </Button>
  );
}

export function AnswerCard({ id, answer, asker, chain, options, gnoweb, own, draw, onFly }: AnswerCardProps) {
  const external = useExternalLinks(gnoweb, own);
  return (
    <>
      <Card tone="signal" compact>
        <Card.Header
          icon="spark"
          kicker="AI concierge"
          title="Jarvis"
          hint={asker === undefined ? "AI · may be wrong" : `asked by ${asker} · AI · may be wrong`}
        />
        <div data-jarvis-markdown="">{draw(answer.markdown, external.link)}</div>
        <Stack space="xs">
          {answer.buttons
            .filter(({ label }) => !holdsHidden(label))
            .map((button) => (
              <Action
                key={button.type === "fly" ? `fly ${button.place}` : `action ${JSON.stringify(button.action)}`}
                {...{ id, button, chain, options, onFly }}
              />
            ))}
        </Stack>
      </Card>
      {external.dialog}
    </>
  );
}
