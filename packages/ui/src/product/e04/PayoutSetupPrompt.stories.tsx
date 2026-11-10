import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { phone } from "../../../.storybook/screens";
import { PayoutSetupPrompt, PayoutsReadyLine } from "./PayoutSetupPrompt";

const meta = {
  title: "Product/E04 Payout setup prompt",
  component: PayoutSetupPrompt,
  args: {
    action: fn(async () => ({ ok: true as const, url: "https://connect.stripe.test/setup" })),
  },
} satisfies Meta<typeof PayoutSetupPrompt>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ActionError: Story = {
  args: {
    action: fn(async (): Promise<{ ok: true; url: string } | { ok: false }> => ({ ok: false })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Nie udało się otworzyć strony Stripe");
  },
};

export const Phone: Story = { decorators: [phone] };

export const ReadyLine: Story = {
  name: "Wypłaty gotowe",
  render: () => <PayoutsReadyLine />,
};
