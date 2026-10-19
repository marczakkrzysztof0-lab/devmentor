import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { NOW, QUESTION, SHARE_URL, ZONE, warsaw } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import { RequestDecision, RequestList, RequestNotFound, type MentorRequestDetail, type MentorRequestItem } from "./MentorRequests";

const end = (start: string, minutes: number) => new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
const item = (id: string, menteeName: string, lengthMinutes: 25 | 50, start: string, status: MentorRequestItem["status"]): MentorRequestItem => ({
  id,
  menteeName,
  lengthMinutes,
  slotStart: start,
  slotEnd: end(start, lengthMinutes),
  status,
});

// Names from the specs only (Kuba, Ola); the "many" state repeats them on different slots.
const REQUESTS: MentorRequestItem[] = [
  item("r1", "Kuba", 25, warsaw("2026-10-20", "12:30"), "awaiting_mentor"),
  item("r2", "Ola", 50, warsaw("2026-10-22", "18:00"), "accepted"),
  item("r3", "Kuba", 25, warsaw("2026-10-15", "18:00"), "lapsed"),
  item("r4", "Ola", 25, warsaw("2026-10-13", "12:00"), "cancelled"),
];

const MANY: MentorRequestItem[] = Array.from({ length: 30 }, (_, i) =>
  item(`m${i}`, i % 2 ? "Ola" : "Kuba", i % 3 ? 25 : 50, warsaw(`2026-10-${String(20 + (i % 10)).padStart(2, "0")}`, i % 2 ? "18:00" : "12:30"), i < 12 ? "awaiting_mentor" : i < 20 ? "accepted" : "declined"),
);

const meta = {
  title: "Product/E02 Paid request/Mentor request blocks",
  component: RequestList,
  tags: ["!autodocs"],
  args: { requests: REQUESTS, timeZone: ZONE, now: NOW, shareUrl: SHARE_URL },
  decorators: [(Story) => <div className="max-w-page p-page-gutter"><Story /></div>],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RequestList>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ----------------------------------------------------------------- list */
export const ListReady: Story = {
  name: "RequestList · ready (grouped)",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Czeka na decyzję", "Zaakceptowane", "Zakończone"]);
    await expect(canvas.getAllByRole("link", { name: "Kuba · 25 min" })[0]).toHaveAttribute("href", "/mentor/requests/r1");
    await expect(canvas.getByText(/zdecyduj do jutra 12:30/)).toBeVisible();
  },
};
export const ListLoading: Story = { name: "RequestList · loading", args: { state: "loading" } };
export const ListEmpty: Story = {
  name: "RequestList · empty → share your link",
  args: { requests: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("textbox", { name: "Twój link" })).toHaveValue(SHARE_URL);
  },
};
export const ListError: Story = {
  name: "RequestList · load error (no partial data)",
  args: { state: "error" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Nie udało się wczytać zapytań — odśwież");
    await expect(within(canvasElement).queryByRole("list")).toBeNull();
  },
};
export const ListPartial: Story = { name: "RequestList · partial (only finished)", args: { requests: REQUESTS.slice(2) } };
export const ListMany: Story = { name: "RequestList · lots of data (30)", args: { requests: MANY } };
export const ListNarrow: Story = { name: "RequestList · 320 px", decorators: [narrow] };

/* ------------------------------------------------------------- decision */
const DETAIL: MentorRequestDetail = { ...REQUESTS[0], question: QUESTION, amountMinor: 15000 };
const okAfter = (ms: number) => fn(async () => { await new Promise((r) => setTimeout(r, ms)); return { ok: true as const }; });

export const Decision: Story = {
  name: "RequestDecision · awaiting decision",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={okAfter(200)} onDecline={okAfter(200)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The question, length and slot come before any button (#18 AC).
    const question = canvas.getByRole("region", { name: "Pytanie" });
    const accept = canvas.getByRole("button", { name: "Akceptuję" });
    await expect(question.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(canvas.getByText("Zdecyduj do jutra 12:30")).toBeVisible();
  },
};
export const DecisionAccept: Story = {
  name: "RequestDecision · accept (test)",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={okAfter(200)} onDecline={okAfter(200)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Akceptuję" }));
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Zaakceptować to pytanie?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Akceptuję pytanie" }));
    await expect(await canvas.findByText("Zaakceptowane — sesja jutro 12:30 (czat tekstowy)")).toBeVisible();
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Odrzucam" })).toBeNull());
  },
};
export const DecisionDecline: Story = {
  name: "RequestDecision · decline with refund (test)",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={okAfter(200)} onDecline={okAfter(200)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Odrzucam" }));
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Odrzucić to pytanie?" });
    await expect(dialog).toHaveAccessibleDescription(/zwraca pieniądze deweloperowi \(150.zł\)/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Odrzucam pytanie" }));
    await expect(await canvas.findByText("Odrzucone — deweloper dostaje pełny zwrot")).toBeVisible();
  },
};
export const DecisionPending: Story = {
  name: "RequestDecision · deciding (pending, open dialog)",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={fn(() => new Promise<{ ok: true }>(() => {}))} onDecline={okAfter(200)} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Akceptuję" }));
    const dialog = await within(document.body).findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Akceptuję pytanie" }));
    await expect(within(dialog).getByRole("button", { name: "Akceptuję pytanie" })).toHaveAttribute("aria-busy", "true");
  },
};
export const DecisionRefused: Story = {
  name: "RequestDecision · developer cancelled a minute ago (test)",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={async () => ({ ok: false as const, code: "cancelled" as const })} onDecline={okAfter(200)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Akceptuję" }));
    await userEvent.click(within(await within(document.body).findByRole("alertdialog")).getByRole("button", { name: "Akceptuję pytanie" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Nie można zaakceptować — zapytanie zostało anulowane przez dewelopera");
  },
};
export const DecisionNetwork: Story = {
  name: "RequestDecision · no network",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={async () => { throw new TypeError("Failed to fetch"); }} onDecline={okAfter(200)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Akceptuję" }));
    await userEvent.click(within(await within(document.body).findByRole("alertdialog")).getByRole("button", { name: "Akceptuję pytanie" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Brak połączenia");
  },
};
export const DecisionOverdue: Story = {
  name: "RequestDecision · slot started, no buttons",
  render: () => <RequestDecision request={{ ...DETAIL, status: "overdue" }} timeZone={ZONE} now={NOW} onAccept={okAfter(0)} onDecline={okAfter(0)} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("button", { name: "Akceptuję" })).toBeNull();
  },
};
export const DecisionAccepted: Story = {
  name: "RequestDecision · already accepted",
  render: () => <RequestDecision request={{ ...DETAIL, status: "accepted" }} timeZone={ZONE} now={NOW} onAccept={okAfter(0)} onDecline={okAfter(0)} />,
};
export const DecisionNarrow: Story = {
  name: "RequestDecision · 320 px",
  decorators: [narrow],
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={okAfter(0)} onDecline={okAfter(0)} />,
};
export const NotFound: Story = { name: "RequestNotFound · another mentor's or unknown", render: () => <RequestNotFound /> };

/* C9: „zwrot został zlecony” only when the refund really exists (#18). */
async function acceptAndReadAlert(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Akceptuję" }));
  await userEvent.click(within(await within(document.body).findByRole("alertdialog")).getByRole("button", { name: "Akceptuję pytanie" }));
  return canvas.findByRole("alert");
}
export const RefusalLapsedRefundRequested: Story = {
  name: "RequestDecision · lapsed meanwhile, refund requested (C9)",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={async () => ({ ok: false as const, code: "lapsed" as const, refundStatus: "requested" as const })} onDecline={okAfter(0)} />,
  play: async ({ canvasElement }) => {
    await expect(await acceptAndReadAlert(canvasElement)).toHaveTextContent("Termin minął — zwrot został zlecony automatycznie");
  },
};
export const RefusalLapsedNoRefundYet: Story = {
  name: "RequestDecision · lapsed meanwhile, refund not requested yet (C9)",
  render: () => <RequestDecision request={DETAIL} timeZone={ZONE} now={NOW} onAccept={async () => ({ ok: false as const, code: "lapsed" as const, refundStatus: null })} onDecline={okAfter(0)} />,
  play: async ({ canvasElement }) => {
    await expect(await acceptAndReadAlert(canvasElement)).toHaveTextContent("Termin minął — zwrot zostanie zlecony automatycznie");
  },
};
export const LapsedWithRefund: Story = {
  name: "RequestDecision · lapsed, refund requested (C9)",
  render: () => <RequestDecision request={{ ...DETAIL, status: "lapsed", refundStatus: "requested" }} timeZone={ZONE} now={NOW} onAccept={okAfter(0)} onDecline={okAfter(0)} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Zakończone — przeterminowane, zwrot zlecony")).toBeVisible();
  },
};
export const LapsedWithoutRefund: Story = {
  name: "RequestDecision · lapsed, refund not requested yet (C9)",
  render: () => <RequestDecision request={{ ...DETAIL, status: "lapsed", refundStatus: null }} timeZone={ZONE} now={NOW} onAccept={okAfter(0)} onDecline={okAfter(0)} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Zakończone — przeterminowane, zwrot zostanie zlecony automatycznie")).toBeVisible();
  },
};

export const ListOffline: Story = {
  name: "RequestList · no network while loading (C6)",
  args: { state: "offline" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Brak połączenia z internetem — nie udało się wczytać danych");
  },
};
export const ListZoneNamed: Story = {
  name: "RequestList · zone named once above the list (D3)",
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Europe/Warsaw")).toBeVisible();
  },
};
