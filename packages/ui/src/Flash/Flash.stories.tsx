import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../Button/Button.tsx";
import { Dialog } from "../Dialog/Dialog.tsx";
import { Flash, type FlashMessage } from "./Flash.tsx";

const meta = {
  component: Flash,
  args: { message: { title: "Saved to your rooms", line: "Bubble · the AMA on sessions" }, onClose: () => undefined },
  // In the top layer, so pictured as the whole screen (F331).
  tags: ["viewport"],
} satisfies Meta<typeof Flash>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Timed: Story = {};
export const Empty: Story = { args: { message: null }, tags: ["empty"] };
export const WithAction: Story = {
  args: { message: { title: "Message deleted", action: { label: "Undo", onAction: () => undefined } } },
};
export const LongText: Story = {
  args: {
    message: {
      title: "Your proposal reached GovDAO, and its vote opens in the morning",
      line: "Bubble · the AMA on sessions · the third of the season, with the realm's authors",
      action: { label: "Read it", onAction: () => undefined },
    },
  },
};

// A flash raised from a dialog's action, as the timed story's: it shows over the dialog's scrim (F331).
function FromADialog() {
  const [message, setMessage] = useState<FlashMessage | null>(null);
  return (
    <>
      <Dialog title="Passport" open onClose={() => undefined}>
        <Button
          onClick={() => {
            setMessage({ title: "Saved to your rooms", line: "Bubble · the AMA on sessions" });
          }}
        >
          Save
        </Button>
      </Dialog>
      <Flash
        message={message}
        onClose={() => {
          setMessage(null);
        }}
      />
    </>
  );
}
export const OverADialog: Story = { render: () => <FromADialog /> };
