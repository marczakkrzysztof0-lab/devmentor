import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { FormField } from "../form-field/FormField";
import { Select } from "./Select";

const ZONES = [
  { label: "Europa", options: [
    { value: "Europe/Warsaw", label: "Europe/Warsaw" },
    { value: "Europe/London", label: "Europe/London" },
    { value: "Europe/Berlin", label: "Europe/Berlin" },
  ] },
  { label: "Ameryka", options: [{ value: "America/New_York", label: "America/New_York" }] },
];

const HOURS = ["18:00", "18:30", "19:00", "19:30", "20:00"].map((h) => ({ value: h, label: h }));

const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["!autodocs"],
  args: { "aria-label": "Strefa czasowa", groups: ZONES, defaultValue: "Europe/Warsaw", onValueChange: fn() },
  decorators: [(Story) => <div className="max-w-text"><Story /></div>],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <FormField label="Strefa czasowa" hint="Uzupełniona z przeglądarki.">
        <Select groups={ZONES} defaultValue="Europe/Warsaw" />
      </FormField>
      <div className="flex flex-wrap gap-in-group">
        <FormField label="Od"><Select options={HOURS} defaultValue="18:00" /></FormField>
        <FormField label="Do"><Select options={HOURS} placeholder="Wybierz" /></FormField>
      </div>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "placeholder", node: <Select aria-label="Do" options={HOURS} placeholder="Wybierz godzinę" /> },
        { label: "chosen", node: <Select aria-label="Od" options={HOURS} defaultValue="18:00" /> },
        { label: "hover (no change, S13)", node: <Select aria-label="Od" options={HOURS} defaultValue="18:00" data-preview-state="hover" /> },
        { label: "focus", node: <Select aria-label="Od" options={HOURS} defaultValue="18:00" data-preview-state="focus" /> },
        { label: "error", node: <Select aria-label="Do" options={HOURS} invalid placeholder="Wybierz godzinę" /> },
        { label: "disabled", node: <Select aria-label="Od" options={HOURS} disabled defaultValue="18:00" /> },
      ]}
    />
  ),
};

export const OpenList: Story = {
  name: "Open list (selected item marked)",
  parameters: {
    // Documented exception: while the list is open Radix marks the rest of the page aria-hidden and
    // traps focus in the listbox (WAI-ARIA listbox pattern), so the hidden page cannot receive focus.
    // axe still reports focusable elements inside it (aria-hidden-focus). Every other Select story runs the rule.
    a11y: { config: { rules: [{ id: "aria-hidden-focus", enabled: false }] } },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("combobox", { name: "Strefa czasowa" }));
    await waitFor(() => expect(within(document.body).getByRole("listbox")).toBeVisible());
  },
};

export const LongNarrow: Story = {
  name: "Long option, 320 px",
  decorators: [narrow],
  args: { options: [{ value: "America/Argentina/ComodRivadavia", label: "America/Argentina/ComodRivadavia" }], groups: undefined, defaultValue: "America/Argentina/ComodRivadavia" },
};

export const KeyboardChoice: Story = {
  name: "Test: choose with the keyboard",
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole("combobox", { name: "Strefa czasowa" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const listbox = await within(document.body).findByRole("listbox");
    // The list fades in over duration-menu (DK3), so wait until it is fully visible.
    await waitFor(() => expect(listbox).toBeVisible());
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(args.onValueChange).toHaveBeenCalledWith("Europe/London"));
    await expect(trigger).toHaveTextContent("Europe/London");
    await expect(trigger).toHaveFocus();
  },
};
