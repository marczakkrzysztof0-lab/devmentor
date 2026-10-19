import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { ANNA, NOW, SHARE_URL, ZONE, ANNA_SLOTS, never, wait } from "../../.storybook/fixtures";
import { MentorPageForm, RequestForm, type MentorPageValues, type SaveMentorPageResult, type StartRequestResult } from "../product";

// Form pattern: every API response state as its own story (prompt, stage 3).
// Server actions are async fn() mocks that return the codes of spec #14 / #17.
const PAGE: MentorPageValues = { displayName: ANNA.displayName, publicWorkUrl: ANNA.publicWorkUrl, description: ANNA.description, price25: "150", price50: "280", slug: "anna-k" };

function Editor({ action }: { action: (v: MentorPageValues, o: { publish: boolean }) => Promise<SaveMentorPageResult> }) {
  return <MentorPageForm initial={PAGE} baseUrl="http://localhost:3000" action={action} />;
}

const meta = {
  title: "Patterns/Form",
  component: Editor,
  tags: ["!autodocs"],
  args: { action: fn(async () => { await wait(300); return { ok: true as const, shareUrl: SHARE_URL }; }) },
  decorators: [(Story) => <div className="p-page-gutter"><Story /></div>],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Editor>;

export default meta;
type Story = StoryObj<typeof meta>;

const publish = (el: HTMLElement) => userEvent.click(within(el).getByRole("button", { name: "Opublikuj stronę" }));

export const Idle: Story = { name: "1 · Idle: labels always visible" };

export const ValidateOnBlur: Story = {
  name: "2 · Validation when leaving a field",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const url = canvas.getByRole("textbox", { name: "Link do publicznej pracy" });
    await userEvent.clear(url);
    await userEvent.type(url, "github.com/annak");
    await userEvent.tab();
    await expect(url).toHaveAccessibleDescription(/Link musi zaczynać się od https:\/\/ albo http:\/\//);
  },
};

export const Pending: Story = {
  name: "3 · Waiting for the server (double submit blocked)",
  args: { action: fn(() => never<SaveMentorPageResult>()) },
  play: async ({ args, canvasElement }) => {
    await publish(canvasElement);
    await publish(canvasElement);
    await expect(args.action).toHaveBeenCalledTimes(1);
  },
};

export const FieldError: Story = {
  name: "4 · Field error from the server, focus on the first error",
  args: { action: fn(async (): Promise<SaveMentorPageResult> => ({ ok: false, errors: { slug: "Ten adres jest zajęty" } })) },
  play: async ({ canvasElement }) => {
    await publish(canvasElement);
    await waitFor(() => expect(within(canvasElement).getByRole("textbox", { name: "Adres strony" })).toHaveFocus());
  },
};

export const ServerError: Story = {
  name: "5 · Server error, input kept",
  args: { action: fn(async (): Promise<SaveMentorPageResult> => ({ ok: false, code: "server_error" })) },
  play: async ({ canvasElement }) => {
    await publish(canvasElement);
    await expect(await within(canvasElement).findByRole("alert")).toBeVisible();
    await expect(within(canvasElement).getByRole("textbox", { name: "Imię i nazwisko" })).toHaveValue("Anna K.");
  },
};

export const NoNetwork: Story = {
  name: "6 · No network, input kept",
  args: { action: fn(async (): Promise<SaveMentorPageResult> => { throw new TypeError("Failed to fetch"); }) },
  play: async ({ canvasElement }) => {
    await publish(canvasElement);
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Brak połączenia z internetem");
  },
};

export const Success: Story = {
  name: "7 · Success only after the server confirms",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await publish(canvasElement);
    await expect(canvas.queryByRole("textbox", { name: "Twój link" })).toBeNull();
    await expect(await canvas.findByRole("textbox", { name: "Twój link" })).toHaveValue(SHARE_URL);
    await expect(args.action).toHaveBeenCalledTimes(1);
  },
};

export const PaymentForm: Story = {
  name: "8 · Same pattern, payment form (#17): price changed",
  render: () => (
    <div className="max-w-text">
      <RequestForm
        slug={ANNA.slug}
        price25Minor={ANNA.price25Minor}
        price50Minor={ANNA.price50Minor}
        slots={ANNA_SLOTS}
        timeZone={ZONE}
        now={NOW}
        action={async (): Promise<StartRequestResult> => ({ ok: false, code: "price_changed", newAmountMinor: 18000 })}
        onRedirect={fn()}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole("radio", { name: /18:00/ })[0]);
    await userEvent.type(canvas.getByRole("textbox", { name: "Imię" }), "Kuba");
    await userEvent.type(canvas.getByRole("textbox", { name: "Twoje pytanie" }), "Jak przenieść cache fetch do server components?");
    await userEvent.click(canvas.getByRole("button", { name: /Zapłać/ }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Cena zmieniła się na 180");
  },
};
