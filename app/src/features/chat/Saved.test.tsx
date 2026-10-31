import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { Saved } from "./Saved.tsx";

// The saved messages' button (slice 4's 4d): a button the account opens the list with; the list's code is asked for when
// it is first opened, so the page holds no dialog before. Its opening, removing and closing are the journeys' (keep.spec.ts).
describe("the saved messages' button", () => {
  it("is a button named Saved with its icon, and holds no dialog before it is opened", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoreProvider>
          <Saved />
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>.*Saved<\/span><\/button>/);
    expect(html).toContain('data-icon="bookmark"');
    expect(html).not.toContain("<dialog");
  });
});
