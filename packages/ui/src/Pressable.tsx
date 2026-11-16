import type { HTMLAttributes, ReactNode } from "react";
import { Anchor } from "./link.tsx";

type PressableProps = Omit<HTMLAttributes<HTMLElement>, "onClick"> & {
  /** A link: the page's own for a path of the site. */
  href?: string | undefined;
  /** A button that acts. `href` and `onClick` are never both. */
  onClick?: (() => void) | undefined;
  /** The link goes to another site: in a new tab, and the other site is told nothing of this one. */
  external?: boolean | undefined;
  children: ReactNode;
};

/** What Row, NavItem and Chip press with, as the package's own: a link with an `href`, a button of type button with an `onClick`,
 * else its words alone. The attributes it is given go to the link or the button; the words alone take none. */
export function Pressable({ href, onClick, external, children, ...rest }: PressableProps) {
  if (href !== undefined) {
    return (
      <Anchor href={href} {...rest} {...(external === true ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </Anchor>
    );
  }
  if (onClick === undefined) return children;
  return (
    <button
      type="button"
      {...rest}
      onClick={() => {
        onClick();
      }}
    >
      {children}
    </button>
  );
}
