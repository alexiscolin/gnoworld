import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../Button/Button.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { Field } from "../Field/Field.tsx";
import { Dialog } from "./Dialog.tsx";

const stamps = <p>A stamp for each world you visited: 12 so far, in 3 constellations.</p>;

// A dialog as a page holds it: closed until its button opens it, closed again by Esc or Close, each
// close counted, so a journey sees one close called once.
function Opener() {
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(0);
  return (
    <>
      <p>Closed {closed}</p>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open the passport
      </Button>
      <Dialog
        title="Your passport"
        open={open}
        onClose={() => {
          setOpen(false);
          setClosed((n) => n + 1);
        }}
      >
        {stamps}
      </Dialog>
    </>
  );
}

// The open dialogs sit in the top layer, over the whole screen: their pictures are the screen's.
const meta = {
  component: Dialog,
  args: { title: "Your passport", open: true, onClose: () => undefined, children: stamps },
  tags: ["viewport"],
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Wide: Story = { args: { wide: true, title: "Search the universe" } };
export const WithField: Story = {
  args: {
    title: "Register a name",
    children: (
      <Field label="Name" prefix="@" help="Letters and digits, 6 at least" value="" onChange={() => undefined} />
    ),
  },
};
export const WithAction: Story = {
  args: {
    title: "Sign the stamp",
    children: (
      <Stack>
        <Cluster>
          <Button emphasis="solid">Sign the stamp</Button>
        </Cluster>
        <p>Your passport gets the stamp of Bubble, your 13th world.</p>
      </Stack>
    ),
  },
};
export const FromAButton: Story = { render: () => <Opener />, tags: ["!viewport"] };
