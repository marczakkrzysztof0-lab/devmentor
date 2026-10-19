import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { Skeleton } from "./Skeleton";

const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  tags: ["!autodocs"],
  args: { label: "Wczytywanie terminów", lines: 3 },
  decorators: [(Story) => <div className="max-w-text"><Story /></div>],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  name: "Line counts",
  render: () => (
    <StateGrid
      items={[
        { label: "1 line", node: <div style={{ width: 240 }}><Skeleton label="Wczytywanie" lines={1} /></div> },
        { label: "3 lines (slot list)", node: <div style={{ width: 240 }}><Skeleton label="Wczytywanie terminów" /></div> },
        { label: "5 lines (request list)", node: <div style={{ width: 240 }}><Skeleton label="Wczytywanie zapytań" lines={5} /></div> },
      ]}
    />
  ),
};

export const States: Story = {
  name: "States (static)",
  render: () => (
    <p className="max-w-text text-muted">
      One state: loading. Static on purpose — nothing moves on its own (P7), so reduced motion needs no change.
    </p>
  ),
};

export const Narrow: Story = {
  name: "320 px",
  decorators: [narrow],
};

export const AnnouncedAsBusy: Story = {
  name: "Test: screen readers hear the label, not the blocks",
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole("status");
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveTextContent("Wczytywanie terminów");
    await expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  },
};
