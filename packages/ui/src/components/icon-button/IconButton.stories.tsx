import type { Meta, StoryObj } from "@storybook/react-vite";
import { X } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { IconButton } from "./IconButton";

const meta = {
  title: "Primitives/IconButton",
  component: IconButton,
  tags: ["!autodocs"],
  args: { label: "Usuń okno wtorek 18:00–20:00", icon: <X />, onClick: fn() },
  argTypes: { icon: { control: false } },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  name: "Variants (one: remove)",
  render: (args) => (
    <StateGrid items={[{ label: "remove (the only use, P1)", node: <IconButton {...args} /> }]} />
  ),
};

export const States: Story = {
  render: (args) => (
    <StateGrid
      items={[
        { label: "default", node: <IconButton {...args} /> },
        { label: "hover", node: <IconButton {...args} data-preview-state="hover" /> },
        { label: "focus", node: <IconButton {...args} data-preview-state="focus" /> },
        { label: "pressed", node: <IconButton {...args} data-preview-state="active" /> },
      ]}
    />
  ),
};

export const InARowNarrow: Story = {
  name: "In a window row, 320 px",
  decorators: [narrow],
  render: (args) => (
    <div className="flex items-center justify-between gap-in-group border-b border-divider py-list-row-y">
      <span className="font-mono">wtorek 18:00–20:00</span>
      <IconButton {...args} />
    </div>
  ),
};

export const ClickAndKeyboard: Story = {
  name: "Test: name, click and keyboard",
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" });
    const box = button.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(24);
    await expect(box.height).toBeGreaterThanOrEqual(24);
    await userEvent.click(button);
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};
