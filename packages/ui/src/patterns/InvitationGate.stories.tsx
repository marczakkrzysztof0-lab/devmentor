import type { Meta, StoryObj } from "@storybook/react-vite";
import { InvitationScreen, NoSessionScreen, SignInScreen } from "../../.storybook/screens";

// Pattern: Invitation-only gate. Each story is one state of the pattern; rules on the pattern page.
const meta = {
  title: "Patterns/Invitation-only gate",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const GateInvite: Story = { name: "Invitation-only gate · invitation", render: () => <InvitationScreen state="valid" /> };
export const GateSignIn: Story = { name: "Invitation-only gate · sign-in link", render: () => <SignInScreen state="valid" /> };
export const GateInactive: Story = { name: "Invitation-only gate · inactive link (no reason given)", render: () => <InvitationScreen state="inactive" /> };
export const GateNoSession: Story = { name: "Invitation-only gate · no session, no sign-up", render: () => <NoSessionScreen /> };
