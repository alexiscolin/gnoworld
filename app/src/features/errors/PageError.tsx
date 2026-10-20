import { EmptyState } from "@gnoworld/ui";

/** What a page that failed shows: its title and its line as an alert, and the way home. */
export function PageError({ title, line }: { title: string; line: string }) {
  return (
    <div role="alert">
      <EmptyState level={1} title={title} line={line} action={{ label: "Back to the universe", href: "/" }} />
    </div>
  );
}
