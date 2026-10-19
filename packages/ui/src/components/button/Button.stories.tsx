import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { Button } from "./Button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["!autodocs"],
  args: { children: "Zapłać 150 zł i wyślij pytanie", variant: "primary", onClick: fn() },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary"] },
    loading: { control: "boolean" },
    disabledReason: { control: "text" },
    fullWidth: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "primary", node: <Button variant="primary">Akceptuję</Button> },
        { label: "secondary", node: <Button variant="secondary">Odrzucam</Button> },
        { label: "primary + secondary on one screen", node: (
          <div className="flex flex-wrap gap-in-group">
            <Button variant="primary">Opublikuj stronę</Button>
            <Button variant="secondary">Zapisz szkic</Button>
          </div>
        ) },
        { label: "fullWidth (phone)", node: <div style={{ width: 280 }}><Button variant="primary" fullWidth>Zapłać 150 zł i wyślij pytanie</Button></div> },
      ]}
    />
  ),
};

const states = (variant: "primary" | "secondary", label: string) => [
  { label: `${variant} · default`, node: <Button variant={variant}>{label}</Button> },
  { label: `${variant} · hover`, node: <Button variant={variant} data-preview-state="hover">{label}</Button> },
  { label: `${variant} · focus`, node: <Button variant={variant} data-preview-state="focus">{label}</Button> },
  { label: `${variant} · pressed`, node: <Button variant={variant} data-preview-state="active">{label}</Button> },
  { label: `${variant} · loading`, node: <Button variant={variant} loading>{label}</Button> },
  { label: `${variant} · disabled + reason`, node: <Button variant={variant} disabledReason="Wybierz termin, żeby przejść do płatności.">{label}</Button> },
];

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <StateGrid items={states("primary", "Zapłać 150 zł i wyślij pytanie")} />
      <StateGrid items={states("secondary", "Wybierz inny termin")} />
    </div>
  ),
};

export const LongLabelNarrow: Story = {
  name: "Long label, 320 px",
  decorators: [narrow],
  args: { children: "Anuluj i odzyskaj 150 zł — możesz anulować, dopóki mentor nie zaakceptuje", variant: "secondary", fullWidth: true },
};

export const AsLink: Story = {
  name: "As link (asChild)",
  render: () => (
    <Button asChild variant="secondary">
      <a href="#availability">Dostępność</a>
    </Button>
  ),
};

export const ClickAndKeyboard: Story = {
  name: "Test: click and keyboard",
  args: { children: "Akceptuję", variant: "primary" },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Akceptuję" });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    button.blur();
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(3);
  },
};

export const LoadingBlocksDoubleSubmit: Story = {
  name: "Test: loading blocks a second submit",
  args: { children: "Zapłać 150 zł i wyślij pytanie", variant: "primary", loading: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: /Zapłać 150 zł/ });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const DisabledExplainsWhy: Story = {
  name: "Test: disabled says why",
  args: { children: "Zapłać 150 zł i wyślij pytanie", variant: "primary", disabledReason: "Wybierz termin, żeby przejść do płatności." },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: /Zapłać 150 zł/ });
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAccessibleDescription("Wybierz termin, żeby przejść do płatności.");
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
