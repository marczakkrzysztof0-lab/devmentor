import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { ANNA, ANNA_SLOTS, NOW, SHARE_URL, never, wait } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import {
  AccessMessage,
  AvailabilityEditor,
  InvitationPanel,
  MentorNav,
  MentorPageForm,
  NoAvailabilityNotice,
  ShareLinkPanel,
  SlotPreview,
  type AvailabilityWindow,
  type MentorPageValues,
} from "./Mentor";

const meta = {
  title: "Product/E01 Mentor page/Mentor blocks",
  component: MentorNav,
  tags: ["!autodocs"],
  args: { current: "page", pendingCount: 2 },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MentorNav>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ nav */
export const Nav: Story = { name: "MentorNav · 2 waiting" };
export const NavNone: Story = { name: "MentorNav · nothing waiting (no counter)", args: { pendingCount: 0, current: "requests" } };
export const NavMany: Story = { name: "MentorNav · 12 waiting, 320 px", args: { pendingCount: 12 }, decorators: [narrow] };
export const NavPlural: Story = {
  name: "MentorNav · Polish plural (test)",
  args: { pendingCount: 1, current: "availability" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "1 zapytanie czeka na decyzję" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Dostępność" })).toHaveAttribute("aria-current", "page");
  },
};

/* ------------------------------------------------- invitation, sign-in */
export const Invitation: Story = {
  name: "InvitationPanel · invite",
  render: () => <InvitationPanel kind="invite" inviterName="Oliwia" expiresLabel="2.11.2026, 19:00" onAccept={fn(async () => { await wait(300); return { ok: true as const }; })} />,
};
export const InvitationPending: Story = {
  name: "InvitationPanel · accepting (test: no double click)",
  render: () => <InvitationPanel kind="invite" inviterName="Oliwia" expiresLabel="2.11.2026, 19:00" onAccept={never} />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Akceptuję zaproszenie" });
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};
export const InvitationUsed: Story = {
  name: "InvitationPanel · link already used → neutral message (test)",
  render: () => <InvitationPanel kind="invite" inviterName="Oliwia" expiresLabel="2.11.2026, 19:00" onAccept={async () => ({ ok: false as const })} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Akceptuję zaproszenie" }));
    await expect(await within(canvasElement).findByRole("heading", { level: 1 })).toHaveTextContent("Ten link jest nieaktywny — poproś zespół o nowy");
  },
};
export const InvitationNetwork: Story = {
  name: "InvitationPanel · no network",
  render: () => <InvitationPanel kind="sign-in" expiresLabel="20.10.2026, 19:00" onAccept={async () => { throw new TypeError("Failed to fetch"); }} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Zaloguj" }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Brak połączenia");
  },
};
export const SignIn: Story = {
  name: "InvitationPanel · sign-in link",
  render: () => <InvitationPanel kind="sign-in" expiresLabel="20.10.2026, 19:00" onAccept={async () => ({ ok: true as const })} />,
};
export const Inactive: Story = { name: "AccessMessage · inactive link", render: () => <AccessMessage kind="inactive-link" /> };
export const InvitationOnly: Story = { name: "AccessMessage · /mentor without session", render: () => <AccessMessage kind="invitation-only" /> };

/* ---------------------------------------------------------- page editor */
const EMPTY: MentorPageValues = { displayName: "", publicWorkUrl: "", description: "", price25: "", price50: "", slug: "" };
const FILLED: MentorPageValues = {
  displayName: ANNA.displayName,
  publicWorkUrl: ANNA.publicWorkUrl,
  description: ANNA.description,
  price25: "150",
  price50: "280",
  slug: "anna-k",
};
const ok = fn(async () => {
  await wait(300);
  return { ok: true as const, shareUrl: SHARE_URL };
});

export const EditorEmpty: Story = {
  name: "MentorPageForm · first visit (empty draft)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={EMPTY} baseUrl="http://localhost:3000" action={ok} /></div>,
};
export const EditorPublishSuccess: Story = {
  name: "MentorPageForm · publish → share link (test)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={FILLED} baseUrl="http://localhost:3000" action={ok} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const link = await canvas.findByRole("textbox", { name: "Twój link" });
    await expect(link).toHaveValue(SHARE_URL);
    await waitFor(() => expect(link).toHaveFocus());
    await expect(canvas.getByRole("textbox", { name: "Adres strony" })).toHaveAttribute("readonly");
  },
};
export const EditorFieldErrors: Story = {
  name: "MentorPageForm · missing fields, focus on the first (test)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={{ ...FILLED, publicWorkUrl: "", price50: "" }} baseUrl="http://localhost:3000" action={ok} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const url = canvas.getByRole("textbox", { name: "Link do publicznej pracy" });
    await waitFor(() => expect(url).toHaveFocus());
    await expect(url).toHaveAccessibleDescription(/Dodaj link do publicznej pracy/);
    await expect(canvas.getByRole("textbox", { name: "Imię i nazwisko" })).toHaveValue("Anna K.");
  },
};
export const EditorSlugTaken: Story = {
  name: "MentorPageForm · server field error „Ten adres jest zajęty” (test)",
  render: () => (
    <div className="p-page-gutter">
      <MentorPageForm initial={FILLED} baseUrl="http://localhost:3000" action={async () => ({ ok: false as const, errors: { slug: "Ten adres jest zajęty" } })} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const slug = canvas.getByRole("textbox", { name: "Adres strony" });
    await waitFor(() => expect(slug).toHaveFocus());
    await expect(slug).toHaveAccessibleDescription(/Ten adres jest zajęty/);
  },
};
export const EditorPending: Story = {
  name: "MentorPageForm · publishing (pending)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={FILLED} baseUrl="http://localhost:3000" action={never} /></div>,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Opublikuj stronę" });
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};
export const EditorServerError: Story = {
  name: "MentorPageForm · server error",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={FILLED} baseUrl="http://localhost:3000" action={async () => ({ ok: false as const, code: "server_error" as const })} /></div>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Opublikuj stronę" }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Nie udało się zapisać po naszej stronie");
  },
};
export const EditorNetwork: Story = {
  name: "MentorPageForm · no network",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={FILLED} baseUrl="http://localhost:3000" action={async () => { throw new TypeError("Failed to fetch"); }} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zapisz szkic" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Brak połączenia");
    await expect(canvas.getByRole("textbox", { name: "Twoje doświadczenie" })).toHaveValue(ANNA.description);
  },
};
export const EditorPublished: Story = {
  name: "MentorPageForm · published (edit, slug locked)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={FILLED} published baseUrl="http://localhost:3000" action={ok} /></div>,
};
export const EditorSlugSuggestion: Story = {
  name: "MentorPageForm · link suggested from the name (test)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={EMPTY} baseUrl="http://localhost:3000" action={ok} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Imię i nazwisko" }), "Anna K.");
    await expect(canvas.getByRole("textbox", { name: "Adres strony" })).toHaveValue("anna-k");
  },
};
export const EditorNarrow: Story = {
  name: "MentorPageForm · 320 px",
  decorators: [narrow],
  render: () => <MentorPageForm initial={FILLED} baseUrl="http://localhost:3000" action={ok} />,
};

/* ---------------------------------------------------- share link, notice */
export const ShareLink: Story = { name: "ShareLinkPanel", render: () => <div className="p-page-gutter max-w-text"><ShareLinkPanel shareUrl={SHARE_URL} /></div> };
export const NoAvailability: Story = { name: "NoAvailabilityNotice", render: () => <div className="p-page-gutter max-w-text"><NoAvailabilityNotice /></div> };

/* -------------------------------------------------------- availability */
const ZONES = [
  { label: "Europa", options: ["Europe/Warsaw", "Europe/London", "Europe/Berlin"].map((z) => ({ value: z, label: z })) },
  { label: "Ameryka", options: ["America/New_York"].map((z) => ({ value: z, label: z })) },
];
const WINDOWS: AvailabilityWindow[] = [
  { weekday: 1, start: "18:00", end: "20:00" },
  { weekday: 3, start: "12:00", end: "13:00" },
];
const saveOk = fn(async () => {
  await wait(300);
  return { ok: true as const, preview: ANNA_SLOTS };
});

export const Availability: Story = {
  name: "AvailabilityEditor · Tuesday and Thursday",
  render: () => <div className="p-page-gutter"><AvailabilityEditor timeZone="Europe/Warsaw" zones={ZONES} windows={WINDOWS} preview={ANNA_SLOTS} now={NOW} action={saveOk} /></div>,
};
export const AvailabilityEmpty: Story = {
  name: "AvailabilityEditor · empty (first visit)",
  render: () => <div className="p-page-gutter"><AvailabilityEditor timeZone="Europe/Warsaw" zones={ZONES} windows={[]} now={NOW} action={saveOk} /></div>,
};
export const AvailabilityAddAndSave: Story = {
  name: "AvailabilityEditor · add a window and save (test)",
  render: () => <div className="p-page-gutter"><AvailabilityEditor timeZone="Europe/Warsaw" zones={ZONES} windows={[]} now={NOW} action={saveOk} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Dodaj okno: wtorek" }));
    await expect(canvas.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Zapisz" }));
    await expect(await canvas.findByText("Dostępność zapisana")).toBeVisible();
    await expect(canvas.getAllByText("25 lub 50 min").length).toBeGreaterThan(0);
  },
};
export const AvailabilityZoneChange: Story = {
  name: "AvailabilityEditor · zone changed, warning (test)",
  render: () => <div className="p-page-gutter"><AvailabilityEditor timeZone="Europe/London" zones={ZONES} windows={WINDOWS} now={NOW} action={saveOk} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole("combobox", { name: "Strefa czasowa" });
    await userEvent.click(select);
    await userEvent.click(await within(document.body).findByRole("option", { name: "Europe/Warsaw" }));
    await expect(await canvas.findByText("Okna zachowają godziny (np. 18:00) w nowej strefie")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Zapisz i zmień strefę" })).toBeVisible();
  },
};
export const AvailabilityServerError: Story = {
  name: "AvailabilityEditor · server error keeps the set",
  render: () => <div className="p-page-gutter"><AvailabilityEditor timeZone="Europe/Warsaw" zones={ZONES} windows={WINDOWS} now={NOW} action={async () => ({ ok: false as const })} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zapisz" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Nie udało się zapisać dostępności");
    await expect(canvas.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" })).toBeVisible();
  },
};
export const AvailabilityNarrow: Story = {
  name: "AvailabilityEditor · 320 px",
  decorators: [narrow],
  render: () => <AvailabilityEditor timeZone="Europe/Warsaw" zones={ZONES} windows={WINDOWS} preview={ANNA_SLOTS} now={NOW} action={saveOk} />,
};

/* ----------------------------------------------------------- preview */
export const Preview: Story = { name: "SlotPreview · next 10", render: () => <div className="p-page-gutter max-w-text"><SlotPreview slots={ANNA_SLOTS} timeZone="Europe/Warsaw" now={NOW} /></div> };
export const PreviewEmpty: Story = { name: "SlotPreview · empty", render: () => <div className="p-page-gutter max-w-text"><SlotPreview slots={[]} timeZone="Europe/Warsaw" now={NOW} /></div> };
