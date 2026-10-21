import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { RadioGroup } from "./RadioGroup";

const LENGTHS = [
  { value: "25", label: "25 min — 150 zł" },
  { value: "50", label: "50 min — 280 zł" },
];

const SLOTS = [
  { value: "2026-10-20T16:00:00Z", label: "jutro 18:00", description: "25 lub 50 min" },
  { value: "2026-10-20T16:30:00Z", label: "jutro 18:30", description: "25 lub 50 min" },
  { value: "2026-10-20T17:00:00Z", label: "jutro 19:00", description: "25 lub 50 min" },
  { value: "2026-10-20T17:30:00Z", label: "jutro 19:30", description: "tylko 25 min" },
];

const meta = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
  tags: ["!autodocs"],
  args: { legend: "Długość sesji", options: LENGTHS, variant: "segmented", defaultValue: "25", onValueChange: fn() },
  argTypes: { variant: { control: "inline-radio", options: ["list", "segmented"] }, options: { control: false } },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <RadioGroup legend="Długość sesji" variant="segmented" options={LENGTHS} defaultValue="25" />
      <RadioGroup legend="Najbliższe terminy (twoja strefa: Europe/Warsaw)" variant="list" options={SLOTS} defaultValue={SLOTS[0].value} />
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <StateGrid
        items={[
          { label: "segmented · default / selected", node: <RadioGroup legend="Długość" variant="segmented" options={LENGTHS} defaultValue="25" /> },
          { label: "segmented · hover (50)", node: <RadioGroup legend="Długość" variant="segmented" options={[LENGTHS[0], { ...LENGTHS[1], previewState: "hover" }]} defaultValue="25" /> },
          { label: "segmented · focus (25)", node: <RadioGroup legend="Długość" variant="segmented" options={[{ ...LENGTHS[0], previewState: "focus" }, LENGTHS[1]]} defaultValue="25" /> },
          { label: "segmented · disabled option", node: <RadioGroup legend="Długość" variant="segmented" options={[LENGTHS[0], { ...LENGTHS[1], disabled: true }]} defaultValue="25" /> },
        ]}
      />
      <StateGrid
        items={[
          { label: "list · nothing selected", node: <RadioGroup legend="Termin" options={SLOTS.slice(0, 2)} /> },
          { label: "list · selected", node: <RadioGroup legend="Termin" options={SLOTS.slice(0, 2)} defaultValue={SLOTS[0].value} /> },
          { label: "list · hover row 2", node: <RadioGroup legend="Termin" options={[SLOTS[0], { ...SLOTS[1], previewState: "hover" }]} /> },
          { label: "list · focus row 1", node: <RadioGroup legend="Termin" options={[{ ...SLOTS[0], previewState: "focus" }, SLOTS[1]]} /> },
          { label: "list · error", node: <RadioGroup legend="Termin" options={SLOTS.slice(0, 2)} error="Wybierz termin, żeby przejść do płatności." /> },
        ]}
      />
    </div>
  ),
};

export const LongNarrow: Story = {
  name: "Long labels, 320 px",
  decorators: [narrow],
  args: {
    legend: "Najbliższe terminy (twoja strefa: America/Argentina/Buenos_Aires)",
    variant: "list",
    options: SLOTS.map((slot) => ({ ...slot, label: `${slot.label} (wtorek 20 października 2026)` })),
    defaultValue: undefined,
  },
};

export const KeyboardAndClick: Story = {
  name: "Test: arrows move the choice, click selects (key held)",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole("radiogroup", { name: "Długość sesji" });
    await expect(group).toBeVisible();
    const short = canvas.getByRole("radio", { name: "25 min — 150 zł" });
    const long = canvas.getByRole("radio", { name: "50 min — 280 zł" });
    await expect(short).toBeChecked();
    await userEvent.click(long);
    await expect(long).toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith("50");
    await expect(long).toHaveFocus();
    // Hold the key like a person does: Radix moves focus in a timeout and checks on focus while the key is down.
    await userEvent.keyboard("{ArrowLeft>}");
    await waitFor(() => expect(short).toHaveFocus());
    await waitFor(() => expect(short).toBeChecked());
    await userEvent.keyboard("{/ArrowLeft}");
    await expect(args.onValueChange).toHaveBeenLastCalledWith("25");
  },
};

/** D12 / Z41: a quick press (keydown + keyup at once, like most people and Playwright) selects, not only focuses. */
export const ArrowsSelect: Story = {
  name: "Test: a quick arrow press selects (WAI-ARIA radio, D12)",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const short = canvas.getByRole("radio", { name: "25 min — 150 zł" });
    const long = canvas.getByRole("radio", { name: "50 min — 280 zł" });
    await userEvent.tab();
    await expect(short).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(long).toHaveFocus();
    await expect(long).toBeChecked();
    await expect(short).not.toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith("50");
    // Wraps at the end; Down/Up work like Right/Left.
    await userEvent.keyboard("{ArrowDown}");
    await expect(short).toHaveFocus();
    await expect(short).toBeChecked();
    await userEvent.keyboard("{ArrowUp}");
    await expect(long).toBeChecked();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(short).toBeChecked();
    await expect(args.onValueChange).toHaveBeenCalledTimes(4);
    // Tab leaves the group from the checked option (one tab stop).
    await userEvent.tab();
    await expect(short).not.toHaveFocus();
  },
};

export const ArrowsSelectList: Story = {
  name: "Test: arrows select in the list variant, skipping a disabled option",
  args: {
    legend: "Termin",
    variant: "list",
    options: [SLOTS[0], { ...SLOTS[1], disabled: true }, SLOTS[2]],
    defaultValue: SLOTS[0].value,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const [first, , third] = canvas.getAllByRole("radio");
    await userEvent.tab();
    await expect(first).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(third).toHaveFocus();
    await expect(third).toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith(SLOTS[2].value);
    await userEvent.keyboard("{ArrowUp}");
    await expect(first).toBeChecked();
  },
};
