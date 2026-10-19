import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, fn, within } from "storybook/test";
import { ANNA_SLOTS, MANY_SLOTS, NOW, ZONE } from "../../.storybook/fixtures";
import { SlotList, SlotPreview } from "../product";

// Pattern: Time-zone-aware slots. Each story is one state of the pattern; rules on the pattern page.
const meta = {
  title: "Patterns/Time-zone-aware slots",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const pad = (node: ReactNode) => <div className="max-w-text p-page-gutter">{node}</div>;

export const ZoneViewer: Story = { name: "Time zones · viewer's zone in the heading", render: () => pad(<SlotList slots={ANNA_SLOTS} length={25} timeZone={ZONE} now={NOW} />) };
export const ZoneLondon: Story = { name: "Time zones · same slots seen from London", render: () => pad(<SlotList slots={ANNA_SLOTS} length={25} timeZone="Europe/London" now={NOW} />) };
export const ZoneFallback: Story = { name: "Time zones · zone unknown → UTC, labelled", render: () => pad(<SlotList slots={ANNA_SLOTS} length={25} timeZone={undefined} now={NOW} />) };
export const ZoneDst: Story = {
  name: "Time zones · DST change on 25.10 keeps the mentor's 18:00",
  render: () => pad(<SlotPreview slots={ANNA_SLOTS} timeZone={ZONE} now={NOW} limit={20} />),
  play: async ({ canvasElement }) => {
    // Tuesday 20.10 (CEST) and Tuesday 27.10 (CET) both start at 18:00 local time (spec #15 DST rule).
    const rows = within(canvasElement).getAllByRole("listitem").map((li) => li.textContent ?? "");
    await expect(rows.some((t) => t.includes("jutro") && t.includes("18:00"))).toBe(true);
    await expect(rows.some((t) => t.includes("27.10") && t.includes("18:00"))).toBe(true);
  },
};
export const ZoneMany: Story = { name: "Time zones · lots of slots, by day", render: () => pad(<SlotList slots={MANY_SLOTS} length={50} timeZone={ZONE} now={NOW} selectable onValueChange={fn()} />) };
