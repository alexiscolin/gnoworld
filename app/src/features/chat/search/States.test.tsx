import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Unread } from "../../../lib/query/client.ts";
import { Trouble, type Search } from "./States.tsx";

// Trouble reads only the failure and the retry of a search.
const failed = (error: unknown) => ({ error, refetch: () => Promise.resolve() }) as unknown as Search;

describe("Trouble", () => {
  it("says what failed: a refusal is not a server that does not answer", () => {
    const html = renderToStaticMarkup(
      <Trouble search={failed(new Unread({ reason: "forbidden" }, { kind: "down", status: 403 }))} />,
    );
    expect(html).toContain("You may not open this.");
  });

  it("keeps its busy word for too many asks", () => {
    const html = renderToStaticMarkup(<Trouble search={failed(new Unread({ reason: "too_many" }))} />);
    expect(html).toContain("Busy, try again in a moment.");
  });
});
