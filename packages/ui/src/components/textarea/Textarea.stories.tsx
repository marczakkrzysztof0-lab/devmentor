import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { FormField } from "../form-field/FormField";
import { Textarea } from "./Textarea";

const QUESTION =
  "Migruję aplikację na server components. Po przeniesieniu strony produktu testy w Jest przestały widzieć fetch z cache — co zwykle trzeba zmienić w konfiguracji i w mockach?";

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
  tags: ["!autodocs"],
  args: { "aria-label": "Twoje pytanie", placeholder: "Co robisz, co już sprawdziłeś i gdzie utknąłeś?" },
  decorators: [(Story) => <div className="max-w-text"><Story /></div>],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <FormField label="Twoje pytanie" hint="Mentor przeczyta je przed decyzją. Możesz wkleić kod.">
        <Textarea defaultValue={QUESTION} />
      </FormField>
      <FormField label="Co już robiłeś" hint="Kilka zdań o tym, co już robiłeś — deweloper zobaczy je na twojej stronie.">
        <Textarea rows={4} defaultValue="Migrowałam dwa duże projekty na server components i wiem, gdzie zwykle pękają testy oraz cache." />
      </FormField>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "default (placeholder = example)", node: <Textarea aria-label="Pytanie" rows={3} placeholder="Co robisz, co już sprawdziłeś i gdzie utknąłeś?" /> },
        { label: "filled", node: <Textarea aria-label="Pytanie" rows={3} defaultValue={QUESTION} /> },
        { label: "focus", node: <Textarea aria-label="Pytanie" rows={3} data-preview-state="focus" defaultValue={QUESTION} /> },
        { label: "error", node: <Textarea aria-label="Pytanie" rows={3} invalid defaultValue="help" /> },
        { label: "read-only", node: <Textarea aria-label="Pytanie" rows={3} readOnly defaultValue={QUESTION} /> },
      ]}
    />
  ),
};

export const LongNarrow: Story = {
  name: "Long text with code, 320 px",
  decorators: [narrow],
  args: {
    rows: 8,
    defaultValue: `${QUESTION}\n\nexport default async function Page() {\n  const product = await fetch("/api/product", { cache: "force-cache" });\n}`,
  },
};

export const TypingKeepsNewLines: Story = {
  name: "Test: Enter makes a new line",
  render: () => (
    <FormField label="Twoje pytanie" error="Opisz problem w co najmniej 20 znakach.">
      <Textarea />
    </FormField>
  ),
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Twoje pytanie" });
    await expect(field).toBeInvalid();
    await expect(field).toHaveAccessibleDescription("Opisz problem w co najmniej 20 znakach.");
    await userEvent.click(field);
    await userEvent.type(field, "Linia 1{Enter}Linia 2");
    await expect(field).toHaveValue("Linia 1\nLinia 2");
  },
};

const NEAR_LIMIT = `${QUESTION} `.repeat(30).slice(0, 3195);

export const CounterNearLimit: Story = {
  name: "Test: counter appears from 80 % of the limit (S14)",
  render: () => (
    <FormField label="Twoje pytanie" hint="Od 20 do 4000 znaków.">
      <Textarea maxLength={4000} defaultValue={NEAR_LIMIT} />
    </FormField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Twoje pytanie" });
    await expect(canvas.queryByTestId("char-counter")).toBeNull();
    await userEvent.click(field);
    await userEvent.keyboard("{End}");
    await userEvent.type(field, " cache");
    await expect(canvas.getByTestId("char-counter")).toHaveTextContent("3201 / 4000 znaków");
  },
};
