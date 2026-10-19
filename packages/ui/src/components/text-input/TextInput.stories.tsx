import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { FormField } from "../form-field/FormField";
import { TextInput } from "./TextInput";

const meta = {
  title: "Primitives/TextInput",
  component: TextInput,
  tags: ["!autodocs"],
  args: { "aria-label": "Cena za 25 min", inputMode: "numeric", suffix: "zł", defaultValue: "150" },
  decorators: [(Story) => <div className="max-w-text"><Story /></div>],
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <FormField label="Imię"><TextInput defaultValue="Kuba" autoComplete="given-name" /></FormField>
      <FormField label="Cena za 25 min" hint="Tyle zapłaci deweloper."><TextInput inputMode="numeric" suffix="zł" defaultValue="150" /></FormField>
      <FormField label="Link do publicznej pracy"><TextInput type="url" placeholder="https://github.com/annak" /></FormField>
      <FormField label="Adres strony" hint="Adresu nie można zmienić po publikacji."><TextInput readOnly defaultValue="devmentor…/m/anna-k" className="font-mono" /></FormField>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "default (empty, placeholder is an example)", node: <TextInput aria-label="Link" placeholder="https://github.com/annak" /> },
        { label: "filled", node: <TextInput aria-label="Imię" defaultValue="Kuba" /> },
        { label: "hover (no change, S13)", node: <TextInput aria-label="Imię" defaultValue="Kuba" data-preview-state="hover" /> },
        { label: "focus", node: <TextInput aria-label="Imię" defaultValue="Kuba" data-preview-state="focus" /> },
        { label: "error", node: <TextInput aria-label="Link" invalid defaultValue="github" /> },
        { label: "read-only", node: <TextInput aria-label="Adres strony" readOnly defaultValue="devmentor…/m/anna-k" /> },
        { label: "disabled", node: <TextInput aria-label="Waluta" disabled defaultValue="PLN" /> },
      ]}
    />
  ),
};

export const LongNarrow: Story = {
  name: "Long value, 320 px",
  decorators: [narrow],
  args: { "aria-label": "Link do publicznej pracy", type: "url", suffix: undefined, defaultValue: "https://github.com/annak/server-components-migration-notes/blob/main/README.md" },
};

export const TypingAndSuffix: Story = {
  name: "Test: typing and the unit is announced",
  args: { defaultValue: "" },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "Cena za 25 min" });
    await userEvent.click(input);
    await userEvent.type(input, "150");
    await expect(input).toHaveValue("150");
    await expect(input).toHaveAccessibleDescription("zł");
  },
};
