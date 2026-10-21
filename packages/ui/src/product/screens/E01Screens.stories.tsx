import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { narrow } from "../../../.storybook/helpers";
import {
  AvailabilityScreen,
  EditorScreen,
  InvitationScreen,
  NoSessionScreen,
  ShareProfileScreen,
  SignInScreen,
  phone,
} from "../../../.storybook/screens";

// Full-screen stories of E01 screens: mentor S1–S5 and the share page S6 for #16 alone (gap D1). State map: "E01 Mentor page/Screens – state map".
const meta = {
  title: "Product/E01 Mentor page/Screens",
  component: InvitationScreen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { state: "valid" },
} satisfies Meta<typeof InvitationScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/* S1 /invite/[token] */
export const S1Valid: Story = {
  name: "S1 Invitation · valid link (test: team text, no name)",
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { level: 1 })).toHaveTextContent(/^Zespół DevMentora zaprasza cię do DevMentora$/);
  },
};
export const S1Accepting: Story = {
  name: "S1 Invitation · accepting",
  args: { state: "accepting" },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Akceptuję zaproszenie" });
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};
export const S1Inactive: Story = { name: "S1 Invitation · expired, used or unknown", args: { state: "inactive" } };
export const S1Network: Story = {
  name: "S1 Invitation · no network",
  args: { state: "network" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Akceptuję zaproszenie" }));
    await expect(await within(canvasElement).findByRole("alert")).toBeVisible();
  },
};

/* S2 /sign-in/[token] */
export const S2Valid: Story = {
  name: "S2 Sign-in · valid link, 72 h (test)",
  render: () => <SignInScreen state="valid" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // „Now” in the stories is 19.10.2026, 19:00; a sign-in link is valid 72 h (spec #14, gap D7).
    await expect(canvas.getByText("Link ważny do 22.10.2026, 19:00.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Zaloguj" })).toBeVisible();
  },
};
export const S2Inactive: Story = { name: "S2 Sign-in · inactive link", render: () => <SignInScreen state="inactive" /> };

/* S3 /mentor without a session */
export const S3NoSession: Story = { name: "S3 /mentor · no session (invitation only)", render: () => <NoSessionScreen /> };

/* S4 /mentor editor */
export const S4Loading: Story = {
  name: "S4 Editor · loading (Suspense fallback, D9)",
  render: () => <EditorScreen state="loading" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Wczytywanie strony");
  },
};
export const S4FirstVisit: Story = {
  name: "S4 Editor · first visit (test: E01 nav without „Zapytania”)",
  render: () => <EditorScreen state="first-visit" />,
  play: async ({ canvasElement }) => {
    const nav = within(within(canvasElement).getByRole("navigation", { name: "Panel mentora" }));
    await expect(nav.getByRole("link", { name: "Strona" })).toHaveAttribute("aria-current", "page");
    await expect(nav.queryByRole("link", { name: "Zapytania" })).toBeNull();
    await expect(nav.getByRole("button", { name: "Wyloguj" })).toBeVisible();
    // Placeholder slug shown; the name suggestion replaces it (D4, L9, Z10).
    const canvas = within(canvasElement);
    const slug = canvas.getByLabelText("Adres strony");
    await expect(slug).toHaveValue("mentor-k3x7qa");
    await userEvent.type(canvas.getByLabelText("Imię i nazwisko"), "Anna K.");
    await expect(slug).toHaveValue("anna-k");
  },
};
export const S4Publish: Story = {
  name: "S4 Editor · publish → share link",
  render: () => <EditorScreen state="filled-draft" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const link = await canvas.findByRole("textbox", { name: "Twój link" });
    await waitFor(() => expect(link).toHaveFocus());
  },
};
export const S4Publishing: Story = {
  name: "S4 Editor · publishing",
  render: () => <EditorScreen state="publishing" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Opublikuj stronę" }));
  },
};
export const S4SlugTaken: Story = {
  name: "S4 Editor · address taken",
  render: () => <EditorScreen state="slug-taken" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Opublikuj stronę" }));
    await waitFor(() => expect(within(canvasElement).getByRole("textbox", { name: "Adres strony" })).toHaveFocus());
  },
};
export const S4ServerError: Story = {
  name: "S4 Editor · server error",
  render: () => <EditorScreen state="server-error" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Opublikuj stronę" }));
    await expect(await within(canvasElement).findByRole("alert")).toBeVisible();
  },
};
export const S4Network: Story = {
  name: "S4 Editor · no network",
  render: () => <EditorScreen state="network" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Zapisz szkic" }));
    await expect(await within(canvasElement).findByRole("alert")).toBeVisible();
  },
};
export const S4SessionExpired: Story = {
  name: "S4 Editor · session expired on save (L6, Z7)",
  render: () => <EditorScreen state="session-expired" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Sesja wygasła — poproś zespół o link do logowania");
    await expect(canvas.getByLabelText("Imię i nazwisko")).toHaveValue("Anna K.");
  },
};
export const S4Published: Story = {
  name: "S4 Editor · published, editing (share panel without focus, L8, Z9)",
  render: () => <EditorScreen state="published" />,
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("textbox", { name: "Twój link" });
    await expect(link).toHaveValue("http://localhost:3000/m/anna-k");
    await expect(link).not.toHaveFocus();
    await expect(within(canvasElement).getByLabelText("Adres strony")).toHaveAttribute("readonly");
  },
};
export const S4NoAvailability: Story = {
  name: "S4 Editor · published, no availability: notice above the share panel (test, Z40)",
  render: () => <EditorScreen state="published-no-availability" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = canvas.getByText("Nie masz dostępności — nikt nie może wybrać terminu");
    const link = canvas.getByRole("textbox", { name: "Twój link" });
    await expect(notice.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(within(canvas.getByRole("main")).getByRole("heading", { level: 1 })).toHaveTextContent("Twoja strona");
  },
};
export const S4Narrow: Story = { name: "S4 Editor · 320 px", decorators: [narrow], render: () => <EditorScreen state="published" /> };

/* S5 /mentor/availability */
export const S5Loading: Story = {
  name: "S5 Availability · loading (Suspense fallback, D9)",
  render: () => <AvailabilityScreen state="loading" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Wczytywanie dostępności");
  },
};
export const S5FirstVisit: Story = {
  name: "S5 Availability · first visit: zone from the browser, banner once (test, Z16, D11)",
  render: () => <AvailabilityScreen state="first-visit" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation", { name: "Panel mentora" }));
    await expect(nav.getByRole("link", { name: "Dostępność" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual(["Strona", "Dostępność"]);
    await expect(nav.getByRole("button", { name: "Wyloguj" })).toBeVisible();
    await expect(canvas.getByRole("combobox", { name: "Strefa czasowa" })).toHaveTextContent("Europe/Warsaw");
    await expect(canvas.getAllByText(/Nie masz dostępności/)).toHaveLength(1);
  },
};
export const S5Set: Story = { name: "S5 Availability · set", render: () => <AvailabilityScreen state="set" /> };
export const S5Empty: Story = { name: "S5 Availability · empty", render: () => <AvailabilityScreen state="empty" /> };
export const S5ZoneDiffers: Story = {
  name: "S5 Availability · zone being changed (test, Z27)",
  render: () => <AvailabilityScreen state="zone-differs" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("combobox", { name: "Strefa czasowa" }));
    await userEvent.click(await within(document.body).findByRole("option", { name: "Europe/Warsaw" }));
    await expect(await canvas.findByText("Okna zachowają godziny (np. 18:00) w nowej strefie")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Zapisz i zmień strefę" })).toBeVisible();
  },
};
export const S5ServerError: Story = {
  name: "S5 Availability · save failed",
  render: () => <AvailabilityScreen state="server-error" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Zapisz" }));
    await expect(await within(canvasElement).findByRole("alert")).toBeVisible();
  },
};
export const S5Network: Story = {
  name: "S5 Availability · no network (Z28, D9)",
  render: () => <AvailabilityScreen state="network" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Zapisz" }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Brak połączenia z internetem");
  },
};
export const S5SessionExpired: Story = {
  name: "S5 Availability · session expired on save (L6, Z7)",
  render: () => <AvailabilityScreen state="session-expired" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zapisz" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Sesja wygasła — poproś zespół o link do logowania");
    await expect(canvas.getByRole("button", { name: "Usuń okno wtorek 18:00–20:00" })).toBeVisible();
  },
};
export const S5Narrow: Story = { name: "S5 Availability · 320 px", decorators: [narrow], render: () => <AvailabilityScreen state="set" /> };

/* S6 /m/{slug} — #16 only (gap D1): profile and prices, no request form (L1, Z1). Phase 1 of #16 has no slot
   section; phase 2 adds LengthToggle + SlotList selectable={false} below the prices. The S6 stories with
   RequestForm (#16 + #17) are in „E02 Paid request/Screens”. */
export const S6Only16: Story = {
  name: "S6 · #16 only: identity, public work, description, prices (test: order, no form, C1)",
  render: () => <ShareProfileScreen state="ready" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const main = within(canvas.getByRole("main"));
    const h1 = main.getByRole("heading", { level: 1 });
    await expect(h1).toHaveTextContent("Anna K.");
    const link = main.getByRole("link", { name: /github\.com\/annak/ });
    await expect(link).toHaveAttribute("rel", "nofollow noopener ugc");
    await expect(link).toHaveAttribute("target", "_blank");
    const description = main.getByText(/Migrowałam dwa duże projekty/);
    // C1: whole amounts without „,00” — 15000 and 28000 grosze.
    const price25 = main.getByText("150 zł");
    const price50 = main.getByText("280 zł");
    // Order is a requirement (spec #16 UI/UX): identity → public work → description → prices.
    const order = [h1, link, description, price25, price50];
    for (let i = 1; i < order.length; i++) {
      await expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // No request form, question field or booking control in E01 (L1, Z1); the only link is the public work.
    await expect(canvas.queryAllByRole("textbox")).toHaveLength(0);
    await expect(canvas.queryAllByRole("button")).toHaveLength(0);
    await expect(canvas.queryAllByRole("radio")).toHaveLength(0);
    await expect(canvasElement.querySelectorAll("form, input, textarea")).toHaveLength(0);
    await expect(canvas.getAllByRole("link")).toHaveLength(1);
    // No ratings or reviews in the page's own copy (N02, A03). The mentor's description is their own text
    // (the fixture says „Pomogę ci ocenić…”), so it is left out of this check.
    const copy = (canvasElement.textContent ?? "").replace(description.textContent ?? "", "");
    await expect(copy).not.toMatch(/ocen|opini|rating|review|★/i);
  },
};
export const S6Only16LongDescription: Story = {
  name: "S6 · #16 only: 2000-character description, wrapped, not truncated",
  render: () => <ShareProfileScreen state="long-description" />,
  play: async ({ canvasElement }) => {
    const description = within(canvasElement).getByText(/Prowadziłam migracje aplikacji/);
    await expect(description.textContent?.length).toBe(2000);
    await expect(description.scrollWidth).toBeLessThanOrEqual(description.clientWidth);
  },
};
export const S6Only16Phone: Story = {
  name: "S6 · #16 only: phone 375 px, 400-character description — identity, work and prices in the first screen (test, K2)",
  decorators: [phone],
  render: () => <ShareProfileScreen state="description-400" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frameTop = canvasElement.getBoundingClientRect().top;
    for (const element of [
      canvas.getByRole("heading", { level: 1 }),
      canvas.getByRole("link", { name: /github\.com\/annak/ }),
      canvas.getByText("150 zł"),
      canvas.getByText("280 zł"),
    ]) {
      await expect(element.getBoundingClientRect().bottom - frameTop).toBeLessThanOrEqual(812);
    }
  },
};
export const S6Only16Narrow: Story = {
  name: "S6 · #16 only: 320 px",
  decorators: [narrow],
  render: () => <ShareProfileScreen state="ready" />,
};
export const S7NotFound: Story = {
  name: "S7 · no such mentor page (draft, unknown slug, /m): no mentor data",
  render: () => <ShareProfileScreen state="not-found" />,
  play: async ({ canvasElement }) => {
    const main = within(within(canvasElement).getByRole("main"));
    await expect(main.getByRole("heading", { level: 1 })).toHaveTextContent("Nie ma takiej strony mentora");
    await expect(canvasElement.textContent).not.toMatch(/Anna|zł|github/);
  },
};
