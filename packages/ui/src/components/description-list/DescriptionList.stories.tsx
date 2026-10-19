import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { narrow } from "../../../.storybook/helpers";
import { Amount } from "../../product/shared/Amount";
import { DescriptionList } from "./DescriptionList";

const REQUEST = [
  { label: "Termin", value: <><span className="font-mono">jutro 12:30–12:55</span> <span className="text-muted">(Europe/Warsaw)</span></> },
  { label: "Sesja", value: "25 min, czat tekstowy" },
  { label: "Kwota", value: <Amount minor={15000} /> },
];

const meta = {
  title: "Primitives/DescriptionList",
  component: DescriptionList,
  tags: ["!autodocs"],
  args: { items: REQUEST, "aria-label": "Szczegóły zapytania" },
  argTypes: { items: { control: false } },
  decorators: [(Story) => <div className="max-w-text"><Story /></div>],
} satisfies Meta<typeof DescriptionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  name: "Variants: plain, with one emphasised fact",
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <DescriptionList aria-label="Szczegóły zapytania" items={REQUEST} />
      <DescriptionList
        aria-label="Kwoty"
        items={[
          { label: "Do wypłaty", value: <Amount minor={42550} />, emphasis: true },
          { label: "Wypłacone do tej pory", value: <Amount minor={28000} /> },
        ]}
      />
    </div>
  ),
};

export const States: Story = {
  name: "States (static)",
  render: () => (
    <p className="max-w-text text-muted">
      DescriptionList is not interactive: no hover, focus, pressed, disabled or loading. A missing value is written in
      words („brak”), never left empty.
    </p>
  ),
};

export const LongNarrow: Story = {
  name: "Long values, 320 px",
  decorators: [narrow],
  args: {
    items: [
      { label: "Termin", value: "wtorek 20 października 2026, 12:30–12:55 (America/Argentina/Buenos_Aires)" },
      { label: "Kwota", value: <Amount minor={13450} /> },
    ],
  },
};

export const Semantics: Story = {
  name: "Test: real term–description pairs",
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByLabelText("Szczegóły zapytania");
    await expect(list.tagName).toBe("DL");
    await expect(list.querySelectorAll("dt")).toHaveLength(3);
    await expect(list.querySelectorAll("dd")).toHaveLength(3);
    await expect(within(list).getByText("150 zł")).toHaveClass("font-mono");
  },
};
