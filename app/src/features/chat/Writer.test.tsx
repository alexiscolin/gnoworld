import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Writer, type WriterProps } from "./Writer.tsx";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

// The device's draft of the conversation, and the composer's props as it is given them.
vi.mock("../../lib/drafts/page.ts", () => ({ pageDrafts: () => ({ get: () => "fixed", set: () => true }) }));
vi.mock("./Composer.tsx", () => ({
  Composer: (props: { draft?: string; onDraft?: unknown; fresh?: boolean }) => (
    <i data-draft={props.draft} data-keeps={String(props.onDraft !== undefined)} data-fresh={String(props.fresh)} />
  ),
}));

const writer = (over: Partial<WriterProps> = {}) =>
  renderToStaticMarkup(
    <Writer
      session={{ kind: "in", address: ME } as WriterProps["session"]}
      room="g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv"
      rooms={[]}
      members={[]}
      onSay={() => true}
      {...over}
    />,
  );

// The composer loads lazily: drawn once and waited for, it is held, as RoomView.test.tsx does.
beforeAll(async () => {
  await prerender(
    <Writer
      session={{ kind: "in", address: ME } as WriterProps["session"]}
      room="x"
      rooms={[]}
      members={[]}
      onSay={() => true}
    />,
  );
});

// The second red pass on the DM bar (R2): a correction Ergo refused, taken up again (`back`), starts from the device's
// draft, which the refusal put back, and keeps what is typed as a plain composer does; a correction's own words are not
// kept. Nothing but the browser journey held this.
describe("Writer: the box of a correction", () => {
  it("starts a plain composer on the device's draft, and keeps each change", () => {
    expect(writer()).toContain('data-draft="fixed"');
    expect(writer()).toContain('data-keeps="true"');
  });

  it("starts a correction on its own words, and keeps nothing of them", () => {
    const markup = writer({ editing: { text: "orig", asked: 1 } });
    expect(markup).toContain('data-draft="orig"');
    expect(markup).toContain('data-keeps="false"');
  });

  it("starts a correction taken up again on the device's draft, kept as a plain one is, and told fresh", () => {
    const markup = writer({ editing: { text: "orig", asked: 1, back: true } });
    expect(markup).toContain('data-draft="fixed"');
    expect(markup).toContain('data-keeps="true"');
    expect(markup).toContain('data-fresh="true"');
  });
});
