import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ANNA, ANNA_SLOTS, F3_SLOTS, LONG_DESCRIPTION, MANY_SLOTS, NOW, ONLY_25_SLOTS, ZONE } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import type { OpenSlot, SessionLength } from "../shared/types";
import {
  LengthToggle,
  MentorDescription,
  MentorIdentity,
  MentorNotFound,
  noSlotsForLengthMessage,
  PriceList,
  SlotList,
} from "./SharePage";

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

function ToggleDemo({ slots = ANNA_SLOTS }: { slots?: OpenSlot[] }) {
  const [length, setLength] = useState<SessionLength>(25);
  return (
    <div className="flex flex-col gap-between-groups">
      <LengthToggle price25Minor={ANNA.price25Minor} price50Minor={ANNA.price50Minor} value={length} onValueChange={setLength} />
      <SlotList slots={slots} length={length} timeZone={ZONE} now={NOW} />
    </div>
  );
}

/** The slot section (h2 „Najbliższe terminy…” and everything under it). */
function slotSection(canvasElement: HTMLElement) {
  const heading = within(canvasElement).getByRole("heading", { level: 2, name: /Najbliższe terminy/ });
  return heading.closest("section")!;
}

export const LengthArrowKeys: Story = {
  name: "LengthToggle · arrow keys select and filter at once (test, D12/Z41)",
  render: () => <ToggleDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const short = canvas.getByRole("radio", { name: /25 min/ });
    const long = canvas.getByRole("radio", { name: /50 min/ });
    await userEvent.click(short);
    await expect(short).toHaveFocus();
    await expect(canvas.getAllByText(/19:30/).length).toBeGreaterThan(0);
    // A quick press, like a person: focus AND selection move; the list filters immediately.
    await userEvent.keyboard("{ArrowRight}");
    await expect(long).toHaveFocus();
    await expect(long).toBeChecked();
    await expect(canvas.queryByText(/19:30/)).toBeNull();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(short).toHaveFocus();
    await expect(short).toBeChecked();
    await expect(canvas.getAllByText(/19:30/).length).toBeGreaterThan(0);
  },
};

export const SlotsGroupedF3: Story = {
  name: "SlotList · by day, 6 per day + „Pokaż więcej (k)” (test, F3: 10 + 2)",
  render: () => <ToggleDemo slots={F3_SLOTS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const section = slotSection(canvasElement);
    const slots = within(section);
    // Exactly two day headings, each day label once in the whole slot section.
    const days = slots.getAllByRole("heading", { level: 3 });
    await expect(days.map((h) => h.textContent)).toEqual(["jutro", "czw. 22.10"]);
    for (const label of ["jutro", "czw. 22.10"]) await expect(slots.getAllByText(label)).toHaveLength(1);
    const lists = slots.getAllByRole("list");
    await expect(lists).toHaveLength(2);
    await expect(lists[0]).toHaveAccessibleName("jutro");
    // First day: 6 time items (each its own li, earliest first, the date in text) and „Pokaż więcej (4)”.
    const firstItems = within(lists[0]).getAllByRole("listitem");
    await expect(firstItems).toHaveLength(6);
    await expect(firstItems.map((li) => li.textContent)).toEqual(
      ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"].map((time) => `jutro, wtorek 20.10, ${time}`),
    );
    await expect(within(lists[1]).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "czwartek 22.10, 18:00",
      "czwartek 22.10, 18:30",
    ]);
    // The only buttons in the slot list are the per-day disclosures; no link, no other control (Z1/F3).
    const more = slots.getByRole("button", { name: "Pokaż więcej (4)" });
    await expect(slots.getAllByRole("button")).toEqual([more]);
    await expect(section.querySelectorAll("a, input, select, textarea, [role=radio], [tabindex]")).toHaveLength(0);
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more.getAttribute("aria-controls")).toBe(lists[0].id);
    // Expanding shows the rest of THAT day only.
    await userEvent.click(more);
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(10);
    await expect(within(lists[1]).getAllByRole("listitem")).toHaveLength(2);
    await expect(more).toHaveFocus();
    // Changing the length resets the expansion (50 min: 9 on the first day → 6 + „Pokaż więcej (3)”).
    await userEvent.click(canvas.getByRole("radio", { name: /50 min/ }));
    const after = within(slotSection(canvasElement));
    const more50 = after.getByRole("button", { name: "Pokaż więcej (3)" });
    await expect(more50).toHaveAttribute("aria-expanded", "false");
    const lists50 = after.getAllByRole("list");
    await expect(within(lists50[0]).getAllByRole("listitem")).toHaveLength(6);
    await expect(within(lists50[1]).getAllByRole("listitem")).toHaveLength(1);
    // Every day label in the slot section is unique.
    const labels = after.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    await expect(new Set(labels).size).toBe(labels.length);
  },
};

export const SlotsGroupedNarrow: Story = {
  name: "SlotList · by day at 320 px, wraps without horizontal scroll (test)",
  decorators: [narrow],
  args: { slots: MANY_SLOTS },
  play: async ({ canvasElement }) => {
    const section = slotSection(canvasElement);
    await expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
    await expect(within(section).getAllByRole("button", { name: /^Pokaż więcej \(\d+\)$/ }).length).toBeGreaterThan(0);
  },
};

export const SlotsNoneForLength: Story = {
  name: "SlotList · 50 min when only 30-minute windows exist (test)",
  args: { slots: ONLY_25_SLOTS, length: 50 },
  play: async ({ canvasElement }) => {
    const section = within(slotSection(canvasElement));
    await expect(noSlotsForLengthMessage(50)).toBe("Brak terminów 50 min w najbliższych 14 dniach — wybierz 25 min");
    await expect(section.getByRole("heading", { level: 3 })).toHaveTextContent(noSlotsForLengthMessage(50));
    await expect(section.queryByText(/\d{2}:\d{2}/)).toBeNull();
  },
};

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
export const SlotsOffline: Story = {
  name: "SlotList · no network while loading (C6)",
  args: { state: "offline" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Brak połączenia z internetem");
  },
};
