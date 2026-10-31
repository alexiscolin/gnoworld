import { Stack } from "../compositions/index.ts";
import { Icon } from "../icons/Icon.tsx";
import { NavItem } from "../NavItem/NavItem.tsx";

export function NavItems() {
  return (
    <Stack as="ul" space="3xs">
      <li>
        <NavItem href="/w/bubble?room=general" current badge={{ count: "96", said: "96 unread" }}>
          #general
        </NavItem>
      </li>
      <li>
        <NavItem href="/w/bubble?room=help" badge={{ count: "31", said: "31 unread" }}>
          #help
        </NavItem>
      </li>
      <li>
        <NavItem href="/w/bubble?dm=noor" lead={<Icon name="people" />} badge={{ said: "2 unread" }}>
          noor
        </NavItem>
      </li>
      <li>
        <NavItem onClick={() => undefined} lead={<Icon name="bookmark" />}>
          Saved
        </NavItem>
      </li>
    </Stack>
  );
}
