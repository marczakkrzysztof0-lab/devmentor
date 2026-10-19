import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { NOW, QUESTION, ZONE } from "../../.storybook/fixtures";
import { RequestDetailScreen } from "../../.storybook/screens";
import { CancelRequest, RequestDecision, type MentorRequestDetail } from "../product";

// Pattern: Confirm irreversible decision. Each story is one state of the pattern; rules on the pattern page.
const meta = {
  title: "Patterns/Confirm irreversible decision",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const pad = (node: ReactNode) => <div className="max-w-text p-page-gutter">{node}</div>;

const DETAIL: MentorRequestDetail = {
  id: "r1",
  menteeName: "Kuba",
  lengthMinutes: 25,
  slotStart: "2026-10-20T10:30:00.000Z",
  slotEnd: "2026-10-20T10:55:00.000Z",
  status: "awaiting_mentor",
  question: QUESTION,
  amountMinor: 15000,
};
export const ConfirmDecline: Story = {
  name: "Confirm decision · decline names the object and the consequence",
  render: () => pad(<RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={async () => ({ ok: true })} onDecline={async () => ({ ok: true })} />),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Odrzucam" }));
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Odrzucić to pytanie?" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Wróć" })).toHaveFocus());
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Odrzucam pytanie" })).toBeVisible());
  },
};
export const ConfirmCancel: Story = {
  name: "Confirm decision · developer cancels with a refund",
  render: () => pad(<CancelRequest amountMinor={15000} action={async () => ({ ok: true })} />),
};
export const ConfirmLostRace: Story = {
  name: "Confirm decision · the other side was faster",
  render: () => <RequestDetailScreen state="cancelled-race" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Akceptuję" }));
    await userEvent.click(within(await within(document.body).findByRole("alertdialog")).getByRole("button", { name: "Akceptuję pytanie" }));
    await expect(await within(canvasElement).findByRole("alert")).toBeVisible();
  },
};
