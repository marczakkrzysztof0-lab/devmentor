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
      <FormField label="Opis" optional hint="Kilka zdań o tym, co już robiłeś.">
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
