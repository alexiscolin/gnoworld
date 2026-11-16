// What a lazy chunk's failure is held by: a chunk that could not be fetched leaves its own place alone, never the page.
// The lazy component keeps its failure for good, so `renew` makes it anew for the next time it is drawn.
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";

interface FailingProps {
  /** What stands in the chunk's place once it failed, given the failure. */
  fallback: (error: unknown) => ReactNode;
  /** Makes the lazy component anew, as the chunk is asked again. */
  renew: () => void;
  children: ReactNode;
}

export class Failing extends Component<FailingProps, { failure: { error: unknown } | undefined }> {
  override state: { failure: { error: unknown } | undefined } = { failure: undefined };
  static getDerivedStateFromError(error: unknown) {
    return { failure: { error } };
  }
  override componentDidCatch() {
    this.props.renew();
  }
  override render() {
    const { failure } = this.state;
    return failure === undefined ? this.props.children : this.props.fallback(failure.error);
  }
}

/** A component whose code is asked when it is first drawn: while it comes `waiting` stands in its place, and when it cannot be
 * fetched `failed` does, given the failure, the page standing. The next time it is drawn, its code is asked again. */
export function chunked<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
  { waiting, failed }: { waiting: ReactNode; failed: (error: unknown) => ReactNode },
) {
  let Lazy = lazy(load);
  return function Chunk(props: Props) {
    return (
      <Failing
        fallback={failed}
        renew={() => {
          Lazy = lazy(load);
        }}
      >
        <Suspense fallback={waiting}>
          <Lazy {...(props as Props & React.JSX.IntrinsicAttributes)} />
        </Suspense>
      </Failing>
    );
  };
}
