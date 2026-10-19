import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { StatusText } from "./StatusText";

const meta = {
  title: "Primitives/StatusText",
  component: StatusText,
  tags: ["!autodocs"],
  args: { tone: "waiting", withIcon: true, children: "Opłacone — czeka na mentora" },
  argTypes: { tone: { control: "inline-radio", options: ["neutral", "waiting", "success", "danger"] } },
} satisfies Meta<typeof StatusText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  name: "Tones",
  render: () => (
    <StateGrid
      items={[
        { label: "waiting", node: <StatusText tone="waiting" withIcon>Czeka na decyzję</StatusText> },
        { label: "success", node: <StatusText tone="success" withIcon>Zaakceptowane — sesja jutro 12:30 (czat tekstowy)</StatusText> },
        { label: "danger", node: <StatusText tone="danger" withIcon>Płatność przerwana — nic nie pobrano</StatusText> },
        { label: "neutral", node: <StatusText>Zakończone — przeterminowane</StatusText> },
        { label: "without icon (list rows)", node: <StatusText tone="success">Zaakceptowane</StatusText> },
      ]}
    />
  ),
};

export const States: Story = {
  name: "States (static)",
  render: () => (
    <p className="max-w-text text-muted">
      StatusText is not interactive: no hover, focus, pressed, disabled or loading. The tone is the state.
    </p>
  ),
};

export const LongNarrow: Story = {
  name: "Long state, 320 px",
  decorators: [narrow],
  args: { tone: "danger", children: "Mentor nie odpowiedział przed terminem — zwrot 150 zł zlecony automatycznie" },
};

export const ReadsAsText: Story = {
  name: "Test: the state is words, the icon is hidden",
  args: { tone: "success", withIcon: true, children: "Zwrot wykonany" },
  play: async ({ canvasElement }) => {
    const text = within(canvasElement).getByText("Zwrot wykonany");
    await expect(text).toBeVisible();
    const svg = canvasElement.querySelector("svg");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
  },
};
