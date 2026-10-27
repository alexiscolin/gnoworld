import type * as core from "@gnoworld/core";
import { foldEdits, type Line } from "@gnoworld/core";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useComposing } from "./composing.ts";
import type { Shown } from "./shown.tsx";

vi.mock("@gnoworld/core", async (importOriginal) => {
  const real = await importOriginal<typeof core>();
  return { ...real, foldEdits: vi.fn(real.foldEdits) };
});

// 4d-dm-bar: what the composer is told of the line it answers or corrects, in a direct message and in a room.
const line = (id: string, text: string): Line => ({
  id,
  time: `2026-10-25T10:00:0${id.slice(1)}.000Z`,
  from: "a",
  text,
  kind: "message",
});
const LINES = [line("m1", "my words"), line("m2", "theirs")];

let root: Root;
type Composed = ReturnType<typeof useComposing>;
let latest: Composed | undefined;
const say = vi.fn<Shown["say"]>(() => true);
function Probe({
  kind,
  lines,
  seen,
}: {
  kind: "dm" | "room";
  lines: readonly Line[];
  seen: (result: Composed) => void;
}) {
  const shown = { kind, key: `${kind}:x`, view: { state: { lines } }, say } as unknown as Shown;
  const result = useComposing(shown);
  useEffect(() => {
    seen(result);
  });
  return null;
}
const draw = (kind: "dm" | "room" = "dm", lines: readonly Line[] = LINES) => {
  act(() => {
    root.render(
      <Probe
        kind={kind}
        lines={lines}
        seen={(result) => {
          latest = result;
        }}
      />,
    );
  });
};
const now = () => {
  if (latest === undefined) throw new Error("nothing drawn");
  return latest;
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  latest = undefined;
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.clearAllMocks();
});

describe("useComposing", () => {
  it("folds no line while none is chosen, a conversation drawn again and again", () => {
    draw();
    draw("dm", [...LINES, line("m3", "more")]);
    draw("dm", [...LINES, line("m3", "more"), line("m4", "and more")]);
    expect(vi.mocked(foldEdits)).not.toHaveBeenCalled();
  });

  it("drops a reply asked before when an edit is asked, and sends the correction without it", () => {
    draw();
    act(() => now().view.onReply?.("m2"));
    expect(now().writer.replying?.id).toBe("m2");
    act(() => now().view.onEdit?.("m1"));
    expect(now().writer.replying).toBeUndefined();
    expect(now().writer.editing?.text).toBe("my words");
    act(() => {
      now().writer.onSay?.("my words, fixed");
    });
    expect(say).toHaveBeenCalledExactlyOnceWith("my words, fixed", { edit: "m1" });
    expect(now().writer.replying).toBeUndefined();
  });

  it("sends nothing for words left as they were, trimmed, and closes the edit", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    let went: boolean | undefined;
    act(() => {
      went = now().writer.onSay?.("  my words ");
    });
    expect(went).toBe(true);
    expect(say).not.toHaveBeenCalled();
    expect(now().writer.editing).toBeUndefined();
  });

  it("keeps the edit open when the correction did not go, and closes it, its box taking the focus, when it did", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    say.mockReturnValueOnce(false);
    act(() => {
      now().writer.onSay?.("changed");
    });
    expect(now().writer.editing?.text).toBe("my words");
    expect(now().writer.focus).toBeUndefined();
    act(() => {
      now().writer.onSay?.("changed");
    });
    expect(now().writer.editing).toBeUndefined();
    expect(now().writer.focus).toBe(true);
  });

  it("takes the focus back to the box when an edit is cancelled, for its conversation alone", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    act(() => now().writer.onCancelEdit?.());
    expect(now().writer.focus).toBe(true);
    draw("room");
    expect(now().writer.focus).toBeUndefined();
    draw();
    expect(now().writer.focus).toBeUndefined();
  });

  it("offers a room no edit", () => {
    draw("room");
    expect(now().view.onEdit).toBeUndefined();
  });

  // /code-review on 4d's DM bar (CR5): a line with `edits` set is an orphan correction, whose original left the window:
  // a correction of it would name a line nothing folds into, and show as a new one.
  it("offers no edit of an orphan correction", () => {
    const orphan: Line = { ...line("m3", "a correction"), edits: "m9" };
    draw("dm", [...LINES, orphan]);
    act(() => now().view.onEdit?.("m3"));
    expect(now().writer.editing).toBeUndefined();
  });
});
