import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorView } from "./ErrorView.tsx";

const where = { here: "/x", earth: "/", galaxy: "/net" };

describe("ErrorView, inline", () => {
  it("is a polite status with its retry, as EmptyState's failed look", () => {
    const html = renderToStaticMarkup(
      <ErrorView kind="unavailable" size="inline" where={where} onRetry={() => undefined} />,
    );
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("Try again");
  });

  it("passes `urgent` on, so a list the reader waits on is an alert", () => {
    const html = renderToStaticMarkup(<ErrorView kind="unavailable" size="inline" where={where} urgent />);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
});
