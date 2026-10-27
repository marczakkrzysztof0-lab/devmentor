import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { TextInput } from "../text-input/TextInput";
import { FormField, Label } from "./FormField";

const meta = {
  title: "Primitives/FormField",
  component: FormField,
  tags: ["!autodocs"],
  args: {
    label: "Imię",
    hint: "Mentor zobaczy tylko imię.",
    optional: false,
    children: <TextInput autoComplete="given-name" />,
  },
  argTypes: { children: { control: false }, error: { control: "text" } },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex max-w-text flex-col gap-between-groups">
      <FormField label="Imię" hint="Mentor zobaczy tylko imię.">
        <TextInput defaultValue="Kuba" />
      </FormField>
      <FormField label="Link do publicznej pracy" error="Dodaj link do publicznej pracy">
        <TextInput type="url" placeholder="https://github.com/annak" />
      </FormField>
      <FormField label="Opis" optional hint="Np. upgrade ingress-nginx do 1.28, migracja do TypeScript 5.">
        <TextInput />
      </FormField>
      <div className="flex flex-col gap-in-group">
        <Label htmlFor="standalone">Label alone (for custom groups)</Label>
        <TextInput id="standalone" />
      </div>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "required (no mark)", node: <FormField label="Imię"><TextInput /></FormField> },
        { label: "optional", node: <FormField label="Opis" optional><TextInput /></FormField> },
        { label: "with hint", node: <FormField label="Imię" hint="Mentor zobaczy tylko imię."><TextInput /></FormField> },
        { label: "error", node: <FormField label="Link do publicznej pracy" error="Dodaj link do publicznej pracy"><TextInput /></FormField> },
        { label: "hint + error", node: <FormField label="Adres strony" hint="Pełny link: devmentor…/m/anna-k" error="Ten adres jest zajęty"><TextInput defaultValue="anna-k" /></FormField> },
      ]}
    />
  ),
};

export const LongNarrow: Story = {
  name: "Long label and error, 320 px",
  decorators: [narrow],
  args: {
    label: "Link do publicznej pracy (GitHub, blog, prezentacja, artykuł albo repozytorium)",
    hint: "Deweloper zobaczy pełną nazwę hosta, zanim w niego kliknie.",
    error: "Dodaj link do publicznej pracy — zaczynający się od https://",
    children: <TextInput type="url" />,
  },
};

export const LabelAndErrorWiring: Story = {
  name: "Test: label, hint and error are announced",
  args: { label: "Link do publicznej pracy", hint: "Pełny adres, np. https://github.com/annak", error: "Dodaj link do publicznej pracy", children: <TextInput type="url" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Link do publicznej pracy");
    await expect(input).toBeRequired();
    await expect(input).toBeInvalid();
    await expect(input).toHaveAccessibleDescription("Dodaj link do publicznej pracy Pełny adres, np. https://github.com/annak");
    await userEvent.click(canvas.getByText("Link do publicznej pracy"));
    await expect(input).toHaveFocus();
  },
};

export const HintUnderLabel: Story = {
  name: "Test: hint directly under the label (hintPlacement=\"label\")",
  args: {
    label: "Twoje doświadczenie",
    hint: "Deweloper zobaczy to na twojej stronie zamiast ocen.",
    hintPlacement: "label",
    children: <TextInput />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Twoje doświadczenie");
    const hint = canvas.getByText("Deweloper zobaczy to na twojej stronie zamiast ocen.");
    await expect(hint).toBeVisible();
    await expect(input).toHaveAccessibleDescription("Deweloper zobaczy to na twojej stronie zamiast ocen.");
    // DOM order: label → hint → control.
    const label = canvas.getByText("Twoje doświadczenie");
    await expect(label.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(hint.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  },
};

/** An unbroken string (a share URL with a 40-character slug, #42) — no space or hyphen to break at. */
const UNBROKEN = "http://localhost:3000/m/katarzynawisniewskakowalczykmentoring123";
export const UnbrokenHintAndErrorNarrow: Story = {
  name: "Test: unbroken hint and error wrap at 320 px, also as a flex item without min-w-0 (#42)",
  decorators: [narrow],
  render: () => (
    // A flex item keeps `min-width: auto` (its min-content width): only `overflow-wrap: anywhere` lets the long
    // token shrink it, `break-words` would still push the row past 320 px.
    <div className="flex">
      <FormField label="Adres strony" hint={`Pełny link: ${UNBROKEN}`} error={`Zajęty: ${UNBROKEN}`} className="flex-1">
        <TextInput defaultValue="katarzynawisniewskakowalczykmentoring123" />
      </FormField>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = canvasElement.querySelector<HTMLElement>('[data-testid="narrow-frame"]');
    await expect(frame).not.toBeNull();
    for (const text of [`Pełny link: ${UNBROKEN}`, `Zajęty: ${UNBROKEN}`]) {
      const node = canvas.getByText(text);
      await expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth);
    }
    await expect(frame!.scrollWidth).toBeLessThanOrEqual(frame!.clientWidth);
  },
};
