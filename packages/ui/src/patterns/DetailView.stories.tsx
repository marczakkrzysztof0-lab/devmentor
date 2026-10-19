import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { RequestDetailScreen } from "../../.storybook/screens";

// Pattern: Detail view. Each story is one state of the pattern; rules on the pattern page.
const meta = {
  title: "Patterns/Detail view",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DetailReady: Story = {
  name: "Detail view · main info and action above the fold",
  render: () => <RequestDetailScreen state="awaiting" />,
  play: async ({ canvasElement }) => {
    const accept = within(canvasElement).getByRole("button", { name: "Akceptuję" });
    await expect(accept).toBeVisible();
  },
};
export const DetailNotFound: Story = { name: "Detail view · does not exist or no access", render: () => <RequestDetailScreen state="not-found" /> };
export const DetailDone: Story = { name: "Detail view · decided (no actions)", render: () => <RequestDetailScreen state="accepted" /> };
