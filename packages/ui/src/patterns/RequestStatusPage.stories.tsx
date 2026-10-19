import type { Meta, StoryObj } from "@storybook/react-vite";
import { RequestPageScreen } from "../../.storybook/screens";

// Pattern: Request status page. Each story is one state of the pattern; rules on the pattern page.
const meta = {
  title: "Patterns/Request status page",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatusPending: Story = { name: "Request status page · waiting for payment", render: () => <RequestPageScreen state="payment-pending" /> };
export const StatusPaid: Story = { name: "Request status page · paid, waiting", render: () => <RequestPageScreen state="paid" /> };
export const StatusAccepted: Story = { name: "Request status page · accepted", render: () => <RequestPageScreen state="accepted" /> };
export const StatusRefund: Story = { name: "Request status page · refund in progress", render: () => <RequestPageScreen state="declined" /> };
export const StatusRefundFailed: Story = { name: "Request status page · refund failed", render: () => <RequestPageScreen state="refund-failed" /> };
