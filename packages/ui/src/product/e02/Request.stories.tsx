import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { ANNA, ANNA_SLOTS, NOW, QUESTION, REQUEST_URL, ZONE, never, wait } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import type { RequestStatus } from "../shared/types";
import {
  CancelNotPossible,
  CancelRequest,
  QuestionCopyBox,
  QuestionText,
  RequestForm,
  RequestStatusView,
  RequestSummary,
  SaveLinkBox,
  type StartRequestResult,
} from "./Request";

const SLOT = { slotStart: "2026-10-20T10:30:00.000Z", slotEnd: "2026-10-20T10:55:00.000Z" }; // jutro 12:30 Warsaw

const meta = {
  title: "Product/E02 Paid request/Request blocks",
  component: RequestForm,
  tags: ["!autodocs"],
  args: {
    slug: ANNA.slug,
    price25Minor: ANNA.price25Minor,
    price50Minor: ANNA.price50Minor,
    slots: ANNA_SLOTS,
    timeZone: ZONE,
    now: NOW,
    action: fn(async (): Promise<StartRequestResult> => {
      await wait(300);
      return { ok: true, checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_example" };
    }),
    onRedirect: fn(),
    onRefreshSlots: fn(),
    createSubmissionId: () => "8a0d6c1e-7f8b-4c1e-9a52-3b1f6e2d4c10",
  },
  decorators: [(Story) => <div className="max-w-text p-page-gutter"><Story /></div>],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RequestForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Fills a valid request: slot jutro 12:30, name, question. */
async function fill(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("radio", { name: "jutro, wtorek 20.10, 18:00" }));
  await userEvent.type(canvas.getByRole("textbox", { name: "Imię" }), "Kuba");
  await userEvent.type(canvas.getByRole("textbox", { name: "Twoje pytanie" }), "Po migracji na server components testy w Jest nie widzą fetch z cache.");
  return canvas;
}
const pay = (canvas: ReturnType<typeof within>, amount = "150 zł") =>
  canvas.getByRole("button", { name: new RegExp(`Zapłać ${amount.split(" ").join(".")} i wyślij pytanie`) });

/* ---------------------------------------------------------- form states */
export const FormIdle: Story = { name: "RequestForm · idle" };

export const FormSuccess: Story = {
  name: "RequestForm · success → redirect to Stripe (test)",
  play: async ({ args, canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    await waitFor(() => expect(args.onRedirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_example"));
    await expect(args.action).toHaveBeenCalledWith(
      expect.objectContaining({ lengthMinutes: 25, expectedAmountMinor: 15000, menteeName: "Kuba", slotStart: ANNA_SLOTS[0].startsAt }),
    );
    await expect(canvas.getByText("Przekierowujemy do płatności…")).toBeVisible();
  },
};

export const FormPending: Story = {
  name: "RequestForm · pending, double click ignored (test)",
  args: { action: fn(() => never<StartRequestResult>()) },
  play: async ({ args, canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    await userEvent.click(pay(canvas));
    await expect(pay(canvas)).toHaveAttribute("aria-busy", "true");
    await expect(args.action).toHaveBeenCalledTimes(1);
  },
};

export const FormClientErrors: Story = {
  name: "RequestForm · empty submit, focus on the first error (test)",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Twoje pytanie" }), "help");
    await userEvent.click(pay(canvas));
    await expect(canvas.getByText("Wybierz termin")).toBeVisible();
    // Form order is length → slot → name → question, so the slot group is the first error (#17).
    await waitFor(() => expect(canvas.getAllByRole("radio", { name: /18:00/ })[0]).toHaveFocus());
    await expect(canvas.getByRole("textbox", { name: "Twoje pytanie" })).toHaveValue("help");
    await expect(args.action).not.toHaveBeenCalled();
  },
};

export const FormFieldErrorFromServer: Story = {
  name: "RequestForm · field error from the server (test)",
  args: { action: fn(async (): Promise<StartRequestResult> => ({ ok: false, code: "field", errors: { question: "Opisz problem w co najmniej 20 znakach — mentor zdecyduje na podstawie pytania" } })) },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    const question = canvas.getByRole("textbox", { name: "Twoje pytanie" });
    await waitFor(() => expect(question).toHaveFocus());
    await expect(question).toHaveAccessibleDescription(/co najmniej 20 znakach/);
  },
};

export const FormSlotTaken: Story = {
  name: "RequestForm · slot taken (test)",
  args: { action: fn(async (): Promise<StartRequestResult> => ({ ok: false, code: "slot_taken" })) },
  play: async ({ args, canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Ten termin właśnie się zajął — wybierz inny");
    await expect(args.onRefreshSlots).toHaveBeenCalled();
    await expect(canvas.getByRole("textbox", { name: "Imię" })).toHaveValue("Kuba");
  },
};

export const FormPriceChanged: Story = {
  name: "RequestForm · price changed to 180 zł (test)",
  args: { action: fn(async (): Promise<StartRequestResult> => ({ ok: false, code: "price_changed", newAmountMinor: 18000 })) },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Cena zmieniła się na 180 zł");
    await expect(pay(canvas, "180 zł")).toBeVisible();
  },
};

export const FormCheckoutFailed: Story = {
  name: "RequestForm · server error: payment did not open",
  args: { action: fn(async (): Promise<StartRequestResult> => ({ ok: false, code: "checkout_failed", retryable: true })) },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Nie udało się otworzyć płatności — spróbuj ponownie");
  },
};

export const FormPaymentsUnavailable: Story = {
  name: "RequestForm · payments unavailable",
  args: { action: fn(async (): Promise<StartRequestResult> => ({ ok: false, code: "payments_unavailable" })) },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Płatności są chwilowo niedostępne");
  },
};

export const FormNetwork: Story = {
  name: "RequestForm · no network (test)",
  args: { action: fn(async (): Promise<StartRequestResult> => { throw new TypeError("Failed to fetch"); }) },
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await userEvent.click(pay(canvas));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Brak połączenia z internetem");
    await expect(pay(canvas)).not.toHaveAttribute("aria-busy");
  },
};

export const FormSlotsLoading: Story = { name: "RequestForm · slots loading", args: { slotsState: "loading" } };
export const FormNoSlots: Story = { name: "RequestForm · no slots", args: { slots: [] } };
export const FormNarrow: Story = { name: "RequestForm · 320 px", decorators: [narrow] };

/* --------------------------------------------------------- request page */
const STATUSES: RequestStatus[] = ["payment_pending", "awaiting_mentor", "payment_failed", "late_payment", "accepted", "declined", "overdue", "lapsed", "cancelled"];

export const StatusAll: Story = {
  name: "RequestStatusView · every state",
  render: () => (
    <div className="flex flex-col gap-between-groups">
      {STATUSES.map((status) => (
        <RequestStatusView key={status} status={status} amountMinor={15000} slotStart={SLOT.slotStart} timeZone={ZONE} now={NOW} />
      ))}
    </div>
  ),
};

export const StatusRefunds: Story = {
  name: "RequestStatusView · refund requested / done / failed",
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <RequestStatusView status="declined" refundStatus="requested" amountMinor={15000} slotStart={SLOT.slotStart} timeZone={ZONE} now={NOW} />
      <RequestStatusView status="cancelled" refundStatus="succeeded" amountMinor={15000} slotStart={SLOT.slotStart} timeZone={ZONE} now={NOW} />
      <RequestStatusView status="lapsed" refundStatus="failed" amountMinor={15000} slotStart={SLOT.slotStart} timeZone={ZONE} now={NOW} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mentor nie przyjmie tego pytania — zwrot 150 zł zlecony automatycznie")).toBeVisible();
    await expect(canvas.getByText("Zwrot nie powiódł się — napisz do nas")).toBeVisible();
  },
};

export const StatusPendingTooLong: Story = {
  name: "RequestStatusView · confirmation takes > 1 min",
  render: () => <RequestStatusView status="payment_pending" pendingTimedOut onRefresh={fn()} amountMinor={15000} slotStart={SLOT.slotStart} timeZone={ZONE} now={NOW} />,
};

export const Summary: Story = {
  name: "RequestSummary",
  render: () => <RequestSummary lengthMinutes={25} {...SLOT} timeZone={ZONE} amountMinor={15000} now={NOW} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("jutro 12:30–12:55")).toBeVisible();
    await expect(canvas.getByText("(Europe/Warsaw)")).toBeVisible();
  },
};

export const Question: Story = { name: "QuestionText · text with code", render: () => <QuestionText text={QUESTION} /> };
export const QuestionLongNarrow: Story = {
  name: "QuestionText · long, 320 px",
  decorators: [narrow],
  render: () => <QuestionText text={`${QUESTION}\n\n${QUESTION}`} />,
};

export const SaveLink: Story = { name: "SaveLinkBox", render: () => <SaveLinkBox url={REQUEST_URL} /> };
export const CopyQuestion: Story = {
  name: "QuestionCopyBox · after an interrupted payment",
  render: () => <QuestionCopyBox question={QUESTION} pageHref="/m/anna-k" />,
};

/* --------------------------------------------------------------- cancel */
export const Cancel: Story = {
  name: "CancelRequest · confirm and cancel (test)",
  render: () => <CancelRequest amountMinor={15000} action={async () => { await wait(200); return { ok: true }; }} onDone={fn()} />,
  play: async ({ canvasElement }) => {
    const page = within(document.body);
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Anuluj i odzyskaj 150.zł/ }));
    const dialog = await page.findByRole("alertdialog", { name: "Anulować zapytanie?" });
    await expect(dialog).toHaveAccessibleDescription(/Mentor nie zobaczy już tego pytania/);
    await userEvent.click(within(dialog).getByRole("button", { name: /Anuluj i odzyskaj 150.zł/ }));
    await waitFor(() => expect(page.queryByRole("alertdialog")).toBeNull());
  },
};
export const CancelLostRace: Story = {
  name: "CancelRequest · mentor accepted a moment earlier (test)",
  render: () => <CancelRequest amountMinor={15000} action={async () => ({ ok: false, reason: "accepted" })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Anuluj i odzyskaj 150.zł/ }));
    await userEvent.click(within(await within(document.body).findByRole("alertdialog")).getByRole("button", { name: /Anuluj i odzyskaj 150.zł/ }));
    await expect(await canvas.findByText("Pytanie zostało właśnie zaakceptowane — sesja się odbędzie")).toBeVisible();
  },
};
export const CancelAfterAcceptance: Story = { name: "CancelNotPossible · after acceptance", render: () => <CancelNotPossible /> };
export const CancelJustAccepted: Story = {
  name: "CancelNotPossible · mentor accepted a moment earlier, after refresh",
  render: () => <CancelNotPossible justAccepted />,
};
