import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { never } from "../../.storybook/fixtures";
import { HostedRedirectAction, HostedReturnNotice, type HostedOpenResult } from "../product";

// Pattern: Redirect to a hosted provider page (A4). Each story is one state.
const meta = {
  title: "Patterns/Redirect to hosted provider page",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const pad = (node: ReactNode) => <div className="max-w-text p-page-gutter">{node}</div>;
const ok = (): Promise<HostedOpenResult> => Promise.resolve({ ok: true, url: "https://connect.stripe.com/setup/e/acct_test/example" });

export const Idle: Story = {
  name: "1 · Before the click: the hint says the user will leave",
  render: () => pad(<HostedRedirectAction label="Skonfiguruj wypłaty w Stripe" provider="Stripe" open={ok} onRedirect={fn()} />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" })).toHaveAccessibleDescription(
      "Otworzy się strona Stripe. Po zakończeniu wrócisz na tę stronę.",
    );
  },
};

export const Opening: Story = {
  name: "2 · Creating the link (double click ignored)",
  render: () => pad(<HostedRedirectAction label="Skonfiguruj wypłaty w Stripe" provider="Stripe" open={() => never<HostedOpenResult>()} onRedirect={fn()} />),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" });
    await userEvent.click(button);
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};

export const Redirecting: Story = {
  name: "3 · Leaving for the provider",
  render: () => pad(<HostedRedirectAction label="Skonfiguruj wypłaty w Stripe" provider="Stripe" open={ok} onRedirect={() => {}} />),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
    await expect(await within(canvasElement).findByText("Przekierowujemy do Stripe…")).toBeVisible();
  },
};

export const Failed: Story = {
  name: "4 · The link could not be created",
  render: () => pad(<HostedRedirectAction label="Skonfiguruj wypłaty w Stripe" provider="Stripe" open={async () => ({ ok: false })} unchanged="Dane do wypłaty i kwoty się nie zmieniły." />),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Nie udało się otworzyć strony Stripe — spróbuj ponownie");
  },
};

export const NoNetwork: Story = {
  name: "5 · No network",
  render: () =>
    pad(
      <HostedRedirectAction
        label="Skonfiguruj wypłaty w Stripe"
        provider="Stripe"
        open={async () => {
          throw new TypeError("Failed to fetch");
        }}
      />,
    ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Skonfiguruj wypłaty w Stripe" }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Nic się nie zmieniło.");
  },
};

export const ReturnCompleted: Story = {
  name: "6 · Back from the provider: completed",
  render: () => pad(<HostedReturnNotice result="completed" provider="Stripe">Stripe sprawdza teraz dane. Stan zobaczysz na tej stronie.</HostedReturnNotice>),
};

export const ReturnInterrupted: Story = {
  name: "7 · Back from the provider: interrupted (attention)",
  render: () => pad(<HostedReturnNotice result="interrupted" provider="Stripe" />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("dokończ, żeby kontynuować");
  },
};
