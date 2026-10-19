import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { narrow } from "../../../.storybook/helpers";
import { RequestDetailScreen, RequestPageScreen, RequestsScreen, SharePageScreen, phone } from "../../../.storybook/screens";

// Full-screen stories of S6–S9. State map: "E02 Paid request/Screens – state map".
const meta = {
  title: "Product/E02 Paid request/Screens",
  component: SharePageScreen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { state: "slots" },
} satisfies Meta<typeof SharePageScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/* S6 /m/{slug} with the request form (#16 + #17) */
export const S6Slots: Story = { name: "S6 Share page · slots and form" };
export const S6Phone: Story = {
  name: "S6 Share page · phone 375 px: identity, work and prices first",
  decorators: [phone],
  play: async ({ canvasElement }) => {
    // Spec #16: at 375 × 812 identity, public work and prices fit the first screen.
    const price = within(canvasElement).getByRole("radio", { name: /50 min/ });
    const frameTop = canvasElement.getBoundingClientRect().top;
    await expect(price.getBoundingClientRect().bottom - frameTop).toBeLessThanOrEqual(812);
  },
};
export const S6NoSlots: Story = { name: "S6 Share page · no slots in 14 days", args: { state: "no-slots" } };
export const S6SlotsLoading: Story = { name: "S6 Share page · slots loading", args: { state: "slots-loading" } };
export const S6SlotsError: Story = { name: "S6 Share page · slots failed to load", args: { state: "slots-error" } };
export const S6LongDescription: Story = { name: "S6 Share page · 2000-character description", args: { state: "long-description" } };
export const S6London: Story = { name: "S6 Share page · viewer in London", args: { state: "viewer-london" } };
export const S6SlotTaken: Story = {
  name: "S6 Share page · slot taken on pay",
  args: { action: async () => ({ ok: false, code: "slot_taken" }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole("radio", { name: /18:00/ })[0]);
    await userEvent.type(canvas.getByRole("textbox", { name: "Imię" }), "Ola");
    await userEvent.type(canvas.getByRole("textbox", { name: "Twoje pytanie" }), "Jak przenieść cache fetch do server components bez psucia testów?");
    await userEvent.click(canvas.getByRole("button", { name: /Zapłać/ }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Ten termin właśnie się zajął — wybierz inny");
  },
};
export const S6NotFound: Story = { name: "S6 Share page · no such mentor", args: { state: "not-found" } };
export const S6Narrow: Story = { name: "S6 Share page · 320 px", decorators: [narrow] };

/* S7 /r/{token} */
export const S7PaymentPending: Story = { name: "S7 Request page · waiting for payment confirmation", render: () => <RequestPageScreen state="payment-pending" /> };
export const S7PaymentPendingLong: Story = { name: "S7 Request page · confirmation > 1 min", render: () => <RequestPageScreen state="payment-pending-long" /> };
export const S7Paid: Story = { name: "S7 Request page · paid, waiting for the mentor (can cancel)", render: () => <RequestPageScreen state="paid" /> };
export const S7PaymentCancelled: Story = { name: "S7 Request page · payment interrupted", render: () => <RequestPageScreen state="payment-cancelled" /> };
export const S7LatePayment: Story = { name: "S7 Request page · payment arrived too late", render: () => <RequestPageScreen state="late-payment" /> };
export const S7Accepted: Story = { name: "S7 Request page · accepted", render: () => <RequestPageScreen state="accepted" /> };
export const S7Declined: Story = { name: "S7 Request page · declined, refund in progress", render: () => <RequestPageScreen state="declined" /> };
export const S7Overdue: Story = { name: "S7 Request page · slot passed, before the lapse job", render: () => <RequestPageScreen state="overdue" /> };
export const S7Lapsed: Story = { name: "S7 Request page · mentor did not answer", render: () => <RequestPageScreen state="lapsed" /> };
export const S7Cancelled: Story = { name: "S7 Request page · cancelled, refund done", render: () => <RequestPageScreen state="cancelled" /> };
export const S7RefundFailed: Story = { name: "S7 Request page · refund failed", render: () => <RequestPageScreen state="refund-failed" /> };
export const S7NotFound: Story = { name: "S7 Request page · unknown or expired link (404)", render: () => <RequestPageScreen state="not-found" /> };
export const S7Narrow: Story = { name: "S7 Request page · 320 px", decorators: [narrow], render: () => <RequestPageScreen state="paid" /> };

/* S8 /mentor/requests */
export const S8Ready: Story = { name: "S8 Requests · grouped", render: () => <RequestsScreen state="ready" /> };
export const S8Empty: Story = { name: "S8 Requests · none yet", render: () => <RequestsScreen state="empty" /> };
export const S8Loading: Story = { name: "S8 Requests · loading", render: () => <RequestsScreen state="loading" /> };
export const S8Error: Story = { name: "S8 Requests · load error", render: () => <RequestsScreen state="error" /> };
export const S8Many: Story = { name: "S8 Requests · 30 requests", render: () => <RequestsScreen state="many" /> };
export const S8Narrow: Story = { name: "S8 Requests · 320 px", decorators: [narrow], render: () => <RequestsScreen state="ready" /> };

/* S9 /mentor/requests/[id] */
export const S9Awaiting: Story = { name: "S9 Request detail · awaiting decision", render: () => <RequestDetailScreen state="awaiting" /> };
export const S9Accepted: Story = { name: "S9 Request detail · accepted", render: () => <RequestDetailScreen state="accepted" /> };
export const S9Overdue: Story = { name: "S9 Request detail · slot started, no decision possible", render: () => <RequestDetailScreen state="overdue" /> };
export const S9CancelledRace: Story = {
  name: "S9 Request detail · developer cancelled a minute ago",
  render: () => <RequestDetailScreen state="cancelled-race" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Akceptuję" }));
    await userEvent.click(within(await within(document.body).findByRole("alertdialog")).getByRole("button", { name: "Akceptuję pytanie" }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Nie można zaakceptować — deweloper anulował zapytanie");
  },
};
export const S9NotFound: Story = { name: "S9 Request detail · not found or no access", render: () => <RequestDetailScreen state="not-found" /> };
export const S9Narrow: Story = { name: "S9 Request detail · 320 px", decorators: [narrow], render: () => <RequestDetailScreen state="awaiting" /> };
