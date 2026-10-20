import { Button } from "../Button/Button.tsx";
import { Cluster, Stack } from "../compositions/index.ts";

export interface EmptyStateProps {
  title: string;
  line: string;
  level?: 1 | 2 | 3;
  action?: { label: string; href: string };
}

const HEADINGS = { 1: "h1", 2: "h2", 3: "h3" } as const;

/** What a list or a page shows when it has nothing: a title, a line, and the one way on, its primary. */
export function EmptyState({ title, line, level = 2, action }: EmptyStateProps) {
  const Heading = HEADINGS[level];
  return (
    <Stack space="s">
      <Heading>{title}</Heading>
      <p>{line}</p>
      {action === undefined ? null : (
        <Cluster>
          <Button href={action.href} emphasis="solid">
            {action.label}
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
