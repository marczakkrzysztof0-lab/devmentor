import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ANNA, ANNA_SLOTS, LONG_DESCRIPTION, MANY_SLOTS, NOW, ZONE } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import type { SessionLength } from "../shared/types";
import { LengthToggle, MentorDescription, MentorIdentity, MentorNotFound, PriceList, SlotList } from "./SharePage";

// One file for the share-page building blocks (#16); every block has its data states.
const meta = {
  title: "Product/E01 Mentor page/Share page blocks",
  component: SlotList,
  tags: ["!autodocs"],
  args: { slots: ANNA_SLOTS, length: 25, timeZone: ZONE, now: NOW },
} satisfies Meta<typeof SlotList>;

export default meta;
type Story = StoryObj<typeof meta>;

/* identity */
export const Identity: Story = {
  name: "MentorIdentity",
  render: () => <MentorIdentity displayName={ANNA.displayName} publicWorkUrl={ANNA.publicWorkUrl} />,
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: /github\.com\/annak/ });
    await expect(link).toHaveAttribute("href", "https://github.com/annak");
    await expect(link).toHaveAttribute("rel", "nofollow noopener ugc");
    await expect(link).toHaveAttribute("target", "_blank");
  },
};

export const IdentityLong: Story = {
  name: "MentorIdentity · long name and URL, 320 px",
  decorators: [narrow],
  render: () => (
    <MentorIdentity
      displayName="Anna Katarzyna Kowalska-Wiśniewska"
      publicWorkUrl="https://github.com/annak/server-components-migration-notes"
    />
  ),
};

/* description */
export const Description: Story = {
  name: "MentorDescription",
  render: () => <MentorDescription text={ANNA.description} />,
};

export const DescriptionLong: Story = {
  name: "MentorDescription · 2000 characters, not truncated",
  render: () => <MentorDescription text={LONG_DESCRIPTION} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent?.length).toBeGreaterThanOrEqual(1990);
  },
};

/* prices */
export const Prices: Story = {
  name: "PriceList",
  render: () => <PriceList price25Minor={ANNA.price25Minor} price50Minor={ANNA.price50Minor} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("150 zł")).toHaveClass("font-mono");
    await expect(canvas.getByText("280 zł")).toBeVisible();
  },
};

function ToggleDemo() {
  const [length, setLength] = useState<SessionLength>(25);
  return (
    <div className="flex flex-col gap-between-groups">
      <LengthToggle price25Minor={ANNA.price25Minor} price50Minor={ANNA.price50Minor} value={length} onValueChange={setLength} />
      <SlotList slots={ANNA_SLOTS} length={length} timeZone={ZONE} now={NOW} />
    </div>
  );
}

export const LengthFiltersSlots: Story = {
  name: "LengthToggle filters slots (test)",
  render: () => <ToggleDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText(/19:30/).length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("radio", { name: /50 min/ }));
    // 19:30 + 50 min does not fit a window ending at 20:00 (spec #16 story 2).
    await waitFor(() => expect(canvas.queryByText(/19:30/)).toBeNull());
    await expect(canvas.getByText("150 zł")).toBeVisible();
  },
};

/* slots: data states */
export const SlotsReady: Story = { name: "SlotList · ready (text, before #17)" };

export const SlotsSelectable: Story = {
  name: "SlotList · selectable (#17)",
  args: { selectable: true },
  render: function Render(args) {
    const [value, setValue] = useState<string | undefined>();
    return <SlotList {...args} value={value} onValueChange={setValue} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getAllByRole("radio")[0];
    await expect(first).toHaveAccessibleName(/wtorek 20\.10, 18:00/);
    await userEvent.click(first);
    await expect(first).toBeChecked();
  },
};

export const SlotsLoading: Story = { name: "SlotList · loading", args: { state: "loading" } };
export const SlotsEmpty: Story = { name: "SlotList · empty (no availability)", args: { slots: [] } };
export const SlotsError: Story = {
  name: "SlotList · load error",
  args: { state: "error" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Nie udało się wczytać terminów — odśwież stronę");
  },
};
export const SlotsPartial: Story = {
  name: "SlotList · partial (only 50 min fits nothing)",
  args: { slots: ANNA_SLOTS.filter((s) => s.startsAt.startsWith("2026-10-22")), length: 25 },
};
export const SlotsMany: Story = { name: "SlotList · lots of data (10 days × 16 slots)", args: { slots: MANY_SLOTS } };
export const SlotsOtherZone: Story = {
  name: "SlotList · viewer in London",
  args: { timeZone: "Europe/London" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 2 })).toHaveTextContent("twoja strefa: Europe/London");
    // Tuesday 18:00 Warsaw is 17:00 in London (spec #15 story 4).
    await expect(canvas.getAllByText(/17:00/).length).toBeGreaterThan(0);
  },
};
export const SlotsZoneFallback: Story = { name: "SlotList · zone unknown → UTC", args: { timeZone: "Mars/Olympus" } };
export const SlotsNarrow: Story = { name: "SlotList · 320 px, selectable", args: { selectable: true, slots: MANY_SLOTS }, decorators: [narrow] };

/* not found */
export const NotFound: Story = {
  name: "MentorNotFound",
  render: () => <MentorNotFound />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { level: 1 })).toHaveTextContent("Nie ma takiej strony mentora");
    await expect(canvasElement.textContent).not.toMatch(/Anna|zł/);
  },
};
