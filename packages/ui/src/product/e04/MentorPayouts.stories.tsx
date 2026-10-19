import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { NOW, SHARE_URL, ZONE, never, warsaw } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import { phone } from "../../../.storybook/screens";
import { MentorPayouts, type OpenStripeResult, type PayoutSession, type SessionPayoutStatus } from "./MentorPayouts";

// Agent test (lekcja 06): /mentor/payouts (#22, E04-S01) built only from the design system.
// Example data: Anna K.'s prices from the brief/specs (150 zł / 280 zł); no backend.

const session = (id: string, menteeName: string, lengthMinutes: 25 | 50, date: string, time: string, payoutStatus: SessionPayoutStatus): PayoutSession => {
  const slotStart = warsaw(date, time);
  return {
    id,
    menteeName,
    lengthMinutes,
    slotStart,
    slotEnd: new Date(new Date(slotStart).getTime() + lengthMinutes * 60_000).toISOString(),
    amountMinor: lengthMinutes === 25 ? 15000 : 28000,
    payoutStatus,
  };
};

const ON_HOLD = [session("s1", "Kuba", 25, "2026-10-15", "18:00", "on_hold"), session("s2", "Ola", 50, "2026-10-13", "12:00", "on_hold")];
const MIXED = [
  session("s1", "Kuba", 25, "2026-10-15", "18:00", "scheduled"),
  session("s2", "Ola", 50, "2026-10-13", "12:00", "in_transit"),
  session("s3", "Kuba", 25, "2026-10-06", "18:00", "paid"),
];
const MANY = Array.from({ length: 40 }, (_, i) =>
  session(
    `m${i}`,
    i % 2 ? "Ola" : "Kuba",
    i % 3 ? 25 : 50,
    `2026-${i < 18 ? "10" : "09"}-${String(1 + (i % 18)).padStart(2, "0")}`,
    i % 2 ? "18:00" : "12:30",
    i < 6 ? "scheduled" : i < 8 ? "in_transit" : "paid",
  ),
);
const sum = (items: PayoutSession[], paid: boolean) =>
  items.filter((s) => (s.payoutStatus === "paid") === paid).reduce((total, s) => total + s.amountMinor, 0);

const meta = {
  title: "Product/E04 Mentor payout (draft)/Screens",
  component: MentorPayouts,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    hasPaidRequest: true,
    setupStatus: "not_started",
    sessions: ON_HOLD,
    owedMinor: sum(ON_HOLD, false),
    paidOutMinor: 0,
    timeZone: ZONE,
    now: NOW,
    shareUrl: SHARE_URL,
    pendingCount: 1,
    onOpenStripe: fn(async (): Promise<OpenStripeResult> => ({ ok: true, url: "https://connect.stripe.com/setup/e/acct_test_example" })),
    onRedirect: fn(),
    onRefresh: fn(),
  },
} satisfies Meta<typeof MentorPayouts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { name: "S10 Payouts · loading", args: { state: "loading" } };
export const LoadError: Story = { name: "S10 Payouts · load error, no partial data", args: { state: "error" } };
export const NoPaidRequest: Story = {
  name: "S10 Payouts · no paid request yet (setup not available)",
  args: { hasPaidRequest: false, sessions: [], owedMinor: 0, pendingCount: 0 },
};
export const FirstSetup: Story = { name: "S10 Payouts · first setup" };
export const FirstSetupNoSession: Story = {
  name: "S10 Payouts · first setup, paid request but no completed session",
  args: { sessions: [], owedMinor: 0 },
};
export const Redirecting: Story = {
  name: "S10 Payouts · opening Stripe",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
    await expect(await canvas.findByText("Przekierowujemy do Stripe…")).toBeInTheDocument();
    await expect(args.onRedirect).toHaveBeenCalled();
  },
};
export const OpenPending: Story = {
  name: "S10 Payouts · waiting for the Stripe link",
  args: { onOpenStripe: fn(never<OpenStripeResult>) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
  },
};
export const OpenFailed: Story = {
  name: "S10 Payouts · Stripe link failed",
  args: { onOpenStripe: fn(async (): Promise<OpenStripeResult> => ({ ok: false })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Nie udało się otworzyć strony Stripe");
  },
};
export const OpenNoNetwork: Story = {
  name: "S10 Payouts · no network",
  args: {
    onOpenStripe: fn(async (): Promise<OpenStripeResult> => {
      throw new TypeError("Failed to fetch");
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Brak połączenia z internetem");
  },
};
export const InProgress: Story = { name: "S10 Payouts · Stripe is verifying", args: { setupStatus: "pending" } };
export const Ready: Story = {
  name: "S10 Payouts · ready",
  args: { setupStatus: "ready", sessions: MIXED, owedMinor: sum(MIXED, false), paidOutMinor: sum(MIXED, true) },
};
export const ActionRequired: Story = {
  name: "S10 Payouts · Stripe asks for more information",
  args: { setupStatus: "action_required" },
};
export const ReturnCompleted: Story = {
  name: "S10 Payouts · back from Stripe, completed",
  args: { setupStatus: "pending", returnFrom: "completed" },
};
export const ReturnCompletedReady: Story = {
  name: "S10 Payouts · back from Stripe, ready at once",
  args: { setupStatus: "ready", returnFrom: "completed", sessions: MIXED, owedMinor: sum(MIXED, false), paidOutMinor: sum(MIXED, true) },
};
export const ReturnInterrupted: Story = {
  name: "S10 Payouts · back from Stripe, interrupted",
  args: { setupStatus: "not_started", returnFrom: "interrupted" },
};
export const Many: Story = {
  name: "S10 Payouts · 40 sessions",
  args: { setupStatus: "ready", sessions: MANY, owedMinor: sum(MANY, false), paidOutMinor: sum(MANY, true) },
};
export const Phone: Story = { name: "S10 Payouts · phone 375 px", decorators: [phone] };
export const Narrow: Story = { name: "S10 Payouts · 320 px", decorators: [narrow], args: { setupStatus: "action_required", returnFrom: "interrupted" } };
