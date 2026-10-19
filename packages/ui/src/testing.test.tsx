import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { storiesOf } from "./testing.tsx";

function Echo({ text, tone }: { text: string; tone: string }) {
  return <p data-tone={tone}>{text}</p>;
}

function only(module: Record<string, unknown>) {
  const [story] = storiesOf(module);
  if (story === undefined) throw new Error("no story");
  return story;
}

describe("storiesOf", () => {
  it("draws a story with its file's component, its own args over the file's, named as exported", () => {
    const story = only({
      default: { component: Echo, args: { text: "the file's", tone: "warm" } },
      Live: { args: { text: "its own" } },
    });
    render(story.element);
    expect(story.name).toBe("Live");
    expect(screen.getByText("its own").dataset["tone"]).toBe("warm");
  });

  it("draws a story's own render, with the same args", () => {
    const story = only({
      default: { component: Echo, args: { text: "the file's", tone: "mine" } },
      Twice: { render: ({ text }: { text: string }) => <b>{`${text}, twice`}</b> },
    });
    render(story.element);
    expect(screen.getByText("the file's, twice").tagName).toBe("B");
  });

  it("refuses a story with neither a component nor a render", () => {
    expect(() => storiesOf({ default: {}, Empty: {} })).toThrow(/Empty/);
  });
});
