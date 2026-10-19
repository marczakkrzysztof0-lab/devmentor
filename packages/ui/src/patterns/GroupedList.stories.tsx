import type { Meta, StoryObj } from "@storybook/react-vite";
import { RequestsScreen } from "../../.storybook/screens";

// Pattern: Grouped list. Each story is one state of the pattern; rules on the pattern page.
const meta = {
  title: "Patterns/Grouped list",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedReady: Story = { name: "Grouped list · grouped by state", render: () => <RequestsScreen state="ready" /> };
export const GroupedLoading: Story = { name: "Grouped list · loading", render: () => <RequestsScreen state="loading" /> };
export const GroupedEmpty: Story = { name: "Grouped list · nothing yet (with the next step)", render: () => <RequestsScreen state="empty" /> };
export const GroupedError: Story = { name: "Grouped list · load error, no partial data", render: () => <RequestsScreen state="error" /> };
export const GroupedMany: Story = { name: "Grouped list · lots of data", render: () => <RequestsScreen state="many" /> };
