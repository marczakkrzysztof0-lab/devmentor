import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Amount } from "./Amount";

// C1 (2026-10-19): whole złoty without „,00”; grosze whenever the amount is not whole.
const meta = {
  title: "Product/Shared/Amount",
  component: Amount,
  tags: ["!autodocs"],
  args: { minor: 15000 },
} satisfies Meta<typeof Amount>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WholeAmount: Story = {
  name: "Whole amount → no grosze (test)",
  args: { minor: 28000 },
  play: async ({ canvasElement }) => {
    const text = within(canvasElement).getByText(/zł/);
    await expect(text.textContent?.replace(/\s/g, " ")).toBe("280 zł");
    await expect(text).toHaveClass("font-mono");
  },
};

export const WithGrosze: Story = {
  name: "Not whole → grosze shown, never rounded (test)",
  args: { minor: 13450 },
  play: async ({ canvasElement }) => {
    const text = within(canvasElement).getByText(/zł/);
    await expect(text.textContent?.replace(/\s/g, " ")).toBe("134,50 zł");
  },
};
