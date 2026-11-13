// The format bar's link tool: a small popover with a field for the address, https only; Enter applies, Escape closes, and the
// selection becomes a link in the field, no Markdown shown.
import { Button, Field, Popover, Stack, type IconButtonProps } from "@gnoworld/ui";
import { useState } from "react";
import { isAddress } from "./kinds.ts";

const START = "https://";

export function LinkTool({
  onApply,
  size,
}: {
  onApply: (address: string) => void;
  size: NonNullable<IconButtonProps["size"]>;
}) {
  const [address, setAddress] = useState(START);
  const [wrong, setWrong] = useState(false);
  const apply = (from: Element) => {
    const given = address.trim();
    setWrong(!isAddress(given));
    if (!isAddress(given)) return;
    onApply(given);
    setAddress(START);
    from.closest<HTMLElement>("[popover]")?.hidePopover();
  };
  return (
    <Popover lazy trigger={null} label="Link" icon={{ name: "link", size, tool: true }}>
      {/* Enter here is the address's, never the message's: the popover sits in the composer's form. */}
      <div
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          apply(event.currentTarget);
        }}
      >
        <Stack space="2xs">
          <Field
            label="Address"
            value={address}
            onChange={(value) => {
              setAddress(value);
              setWrong(false);
            }}
            {...(wrong ? { error: "An address that starts with https://" } : {})}
          />
          {/* Inside the format bar, a tool of it as the bar's own. */}
          <Button
            size="s"
            tool
            onClick={(event) => {
              apply(event.currentTarget);
            }}
          >
            Link
          </Button>
        </Stack>
      </div>
    </Popover>
  );
}
