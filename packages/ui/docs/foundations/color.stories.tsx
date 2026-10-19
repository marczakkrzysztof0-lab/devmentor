import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { ContrastTable } from "../../.storybook/blocks";
import { PAIRS } from "../../.storybook/blocks/contrast";

// Documentation story: measures every colour pair in both themes and fails the test
// run if a text pair drops below 4.5:1 or a UI pair below 3:1 (WCAG 1.4.3, 1.4.11).
const meta = {
  title: "Foundations/Color",
  component: ContrastTable,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen", controls: { disable: true } },
} satisfies Meta<typeof ContrastTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ContrastCheck: Story = {
  name: "Contrast check",
  play: async ({ canvasElement }) => {
    const table = canvasElement.querySelector('[data-testid="contrast-table"]');
    await expect(table).not.toBeNull();
    await waitFor(() => expect(canvasElement.querySelectorAll("tbody tr").length).toBe(PAIRS.length));
    await waitFor(() => expect(canvasElement.textContent).not.toContain("…"));
    const failures = [...canvasElement.querySelectorAll('[data-result="fail"]')].map(
      (cell) => cell.closest("tr")?.querySelector("th")?.textContent,
    );
    await expect(failures).toEqual([]);
  },
};
