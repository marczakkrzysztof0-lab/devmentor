import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { Spinner } from "./Spinner";

const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
  tags: ["!autodocs"],
  args: { label: "Czekamy na potwierdzenie płatności", size: "md" },
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Sizes: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "md (20 px) with text", node: <Spinner label="Czekamy na potwierdzenie płatności" /> },
        { label: "sm (16 px) with text", node: <Spinner size="sm" label="Wczytywanie terminów" /> },
        { label: "decorative (inside a button)", node: <Spinner aria-hidden="true" /> },
      ]}
    />
  ),
};

export const LongNarrow: Story = {
  name: "Long text, 320 px",
  decorators: [narrow],
  args: { label: "Czekamy na potwierdzenie płatności — odświeżamy co 3 sekundy, nic nie zostanie pobrane dwa razy" },
};

export const AnnouncesStatus: Story = {
  name: "Test: announced as status",
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole("status");
    await expect(status).toHaveTextContent("Czekamy na potwierdzenie płatności");
  },
};
