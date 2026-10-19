import type { Meta, StoryObj } from "@storybook/react-vite";
import { X } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import { narrow } from "../../../.storybook/helpers";
import { IconButton } from "../icon-button/IconButton";
import { StatusText } from "../status-text/StatusText";
import { List, ListRow } from "./List";

const meta = {
  title: "Primitives/List",
  component: ListRow,
  tags: ["!autodocs"],
  args: { title: "Kuba · 25 min", meta: "jutro 12:30–12:55 · zdecyduj przed 12:30", href: "#request-1" },
  render: (args) => (
    <List aria-label="Zapytania">
      <ListRow {...args} />
    </List>
  ),
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <List aria-label="Zapytania i okna">
      <ListRow title="Kuba · 25 min" meta="jutro 12:30–12:55 · zdecyduj przed 12:30" href="#r1" end={<StatusText tone="waiting">Czeka na decyzję</StatusText>} />
      <ListRow title="Ola · 50 min" meta="czwartek 18:00–18:50" href="#r2" end={<StatusText tone="success">Zaakceptowane</StatusText>} />
      <ListRow title="wtorek" meta="18:00–20:00" end={<IconButton label="Usuń okno wtorek 18:00–20:00" icon={<X />} />} />
      <ListRow title="czwartek" meta="Brak okien" />
    </List>
  ),
};

export const States: Story = {
  render: () => (
    <List aria-label="Stany wierszy">
      <ListRow title="default (link row)" meta="jutro 12:30–12:55" href="#a" />
      <ListRow title="hover" meta="jutro 12:30–12:55" href="#b" data-preview-state="hover" />
      <ListRow title="static row (not a link)" meta="18:00–20:00" />
    </List>
  ),
};

export const LongNarrow: Story = {
  name: "Long title and meta, 320 px",
  decorators: [narrow],
  args: {
    title: "Krzysztof-Aleksander · 50 min",
    meta: "wtorek 20 października 2026, 18:00–18:50 · zdecyduj przed 18:00 · Europe/Warsaw",
    end: <StatusText tone="waiting">Czeka na decyzję</StatusText>,
  },
};

export const RowLinkAndKeyboard: Story = {
  name: "Test: one link per row, reachable by keyboard",
  render: (args) => (
    <List aria-label="Zapytania">
      <ListRow {...args} />
      <ListRow title="Ola · 50 min" meta="czwartek 18:00" href="#request-2" />
    </List>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("list", { name: "Zapytania" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await expect(within(list).getAllByRole("link")).toHaveLength(2);
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Kuba · 25 min" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Ola · 50 min" })).toHaveFocus();
  },
};
