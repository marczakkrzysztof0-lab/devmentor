import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { ANNA, ANNA_SLOTS, NOW, SHARE_URL, never, wait } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import {
  AccessMessage,
  AvailabilityEditor,
  DESCRIPTION_HINT,
  InvitationPanel,
  MentorNav,
  MentorPageForm,
  NoAvailabilityNotice,
  SESSION_EXPIRED_MESSAGE,
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

/** What Next.js `redirect()` in a server action rejects the caller with (the router navigates meanwhile). */
const redirecting = async (): Promise<never> => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/mentor;303;" });
};

export const NavE01: Story = {
  name: "MentorNav · E01: Strona, Dostępność, Wyloguj — no „Zapytania” (test)",
  args: { current: "page", pendingCount: 2, sections: ["page", "availability"], signOutAction: fn(async () => {}) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "Panel mentora" });
    await expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Strona", "Dostępność"]);
    await expect(canvas.queryByRole("link", { name: /Zapytania|zapyta/ })).toBeNull();
    const signOut = within(nav).getByRole("button", { name: "Wyloguj" });
    signOut.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(args.signOutAction).toHaveBeenCalledTimes(1));
  },
};
export const NavE01PageOnly: Story = {
  name: "MentorNav · E01 before availability: Strona, Wyloguj, 320 px",
  args: { current: "page", pendingCount: 0, sections: ["page"], signOutAction: fn(async () => {}) },
  decorators: [narrow],
};
export const NavSignOutRedirect: Story = {
  name: "MentorNav · Wyloguj → redirect keeps the button busy, no error (test)",
  args: { current: "page", sections: ["page", "availability"], signOutAction: redirecting },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Wyloguj" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};
export const NavSignOutNetwork: Story = {
  name: "MentorNav · Wyloguj without network (test)",
  args: {
    current: "page",
    sections: ["page", "availability"],
    signOutAction: async () => {
      throw new TypeError("Failed to fetch");
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Wyloguj" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Brak połączenia");
    await expect(canvas.getByRole("button", { name: "Wyloguj" })).not.toHaveAttribute("aria-busy");
  },
};

/* ------------------------------------------------- invitation, sign-in */
export const Invitation: Story = {
  name: "InvitationPanel · invite, team text without a name (test)",
  render: () => <InvitationPanel kind="invite" expiresLabel="2.11.2026, 19:00" onAccept={fn(async () => { await wait(300); return { ok: true as const }; })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(/^Zespół DevMentora zaprasza cię do DevMentora$/);
    await expect(canvas.getByText("Link ważny do 2.11.2026, 19:00.")).toBeVisible();
    await expect(canvas.getAllByRole("button").map((b) => b.textContent)).toEqual(["Akceptuję zaproszenie"]);
  },
};
export const InvitationRedirect: Story = {
  name: "InvitationPanel · accept → redirect keeps the button busy, no error (test)",
  render: () => <InvitationPanel kind="invite" expiresLabel="2.11.2026, 19:00" onAccept={redirecting} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Akceptuję zaproszenie" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};
export const InvitationPending: Story = {
  name: "InvitationPanel · accepting (test: no double click)",
  render: () => <InvitationPanel kind="invite" expiresLabel="2.11.2026, 19:00" onAccept={never} />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Akceptuję zaproszenie" });
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};
export const InvitationUsed: Story = {
  name: "InvitationPanel · link already used → neutral message (test)",
  render: () => <InvitationPanel kind="invite" expiresLabel="2.11.2026, 19:00" onAccept={async () => ({ ok: false as const })} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Akceptuję zaproszenie" }));
    await expect(await within(canvasElement).findByRole("heading", { level: 1 })).toHaveTextContent("Ten link jest nieaktywny — poproś zespół o nowy");
  },
};
export const InvitationNetwork: Story = {
  name: "InvitationPanel · no network",
  render: () => <InvitationPanel kind="sign-in" expiresLabel="22.10.2026, 19:00" onAccept={async () => { throw new TypeError("Failed to fetch"); }} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Zaloguj" }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Brak połączenia");
  },
};
export const SignIn: Story = {
  name: "InvitationPanel · sign-in link (valid 72 h)",
  render: () => <InvitationPanel kind="sign-in" expiresLabel="22.10.2026, 19:00" onAccept={async () => ({ ok: true as const })} />,
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
    await expect(canvas.getByRole("textbox", { name: "Adres strony" })).toHaveAccessibleDescription(`Pełny link: ${SHARE_URL}. Adresu nie można zmienić po publikacji.`);
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
    // A fixed value clears its error while typing (no layout shift on the way to the button).
    await userEvent.type(url, "https://github.com/annak");
    await expect(url).not.toHaveAccessibleDescription(/Dodaj link/);
    await expect(url).toHaveFocus();
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
  render: () => <div className="p-page-gutter"><MentorPageForm initial={FILLED} published shareUrl={SHARE_URL} baseUrl="http://localhost:3000" action={ok} /></div>,
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

/* ------------------------------------------ editor: task 3.4 (D4, D5, D6, F1, F2) */
const PLACEHOLDER: MentorPageValues = { ...EMPTY, slug: "mentor-k3x7qa" };
/** Second-person past forms with a gender (C12): „zrobiłeś”, „byłaś”… — „jesteś” is neutral. */
const GENDERED_WORD = /(?<!\p{L})\p{L}*(?:łeś|łaś|eś|aś)(?!\p{L})/giu;
const gendered = (text: string) => [...text.matchAll(GENDERED_WORD)].map((m) => m[0]).filter((w) => w.toLowerCase() !== "jesteś");
const unauthorized = fn(async () => ({ ok: false as const, reason: "unauthorized" as const }));

export const EditorLabelsAndHints: Story = {
  name: "MentorPageForm · six labelled fields, F1 hint, F2 prices in zł, nothing about payouts (test)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={PLACEHOLDER} slugIsPlaceholder baseUrl="http://localhost:3000" action={ok} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // W1/Z23: every field has a programmatic label; the public-work field is exactly „Link do publicznej pracy”.
    for (const label of ["Imię i nazwisko", "Link do publicznej pracy", "Twoje doświadczenie", "Cena za 25 min (zł)", "Cena za 50 min (zł)", "Adres strony"]) {
      await expect(canvas.getByLabelText(label)).toBeVisible();
    }
    await expect(canvas.getAllByRole("textbox")).toHaveLength(6);
    // F1: the hint is visible, sits between the label and the field, and is the field's description.
    const description = canvas.getByLabelText("Twoje doświadczenie");
    await expect(description).toHaveAccessibleDescription(/zamiast ocen/);
    await expect(description).toHaveAccessibleDescription(/np\./);
    await expect(description).toHaveAccessibleDescription(DESCRIPTION_HINT);
    const hint = canvas.getByText(DESCRIPTION_HINT);
    await expect(hint).toBeVisible();
    await expect(canvas.getByText("Twoje doświadczenie").compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(hint.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // F2: currency in the label, a visible „zł” inside each field (not sr-only) that is part of the description.
    for (const label of ["Cena za 25 min (zł)", "Cena za 50 min (zł)"]) {
      const input = canvas.getByLabelText(label);
      const suffix = within(input.parentElement as HTMLElement).getByText("zł");
      await expect(suffix).toBeVisible();
      await expect(suffix).not.toHaveClass("sr-only");
      await expect(input).toHaveAccessibleDescription(/zł/);
      await expect(input).toHaveAccessibleDescription(/Tyle zapłaci deweloper\./);
    }
    // R13, N02, Z36: no payout, bank, tax or rating fields or words; C12: no gendered forms.
    const text = canvasElement.textContent ?? "";
    await expect(text).not.toMatch(/wypłat|bank|konto|IBAN|podat|NIP|ocen[aęy]\b|gwiazd|opini/i);
    await expect(gendered(text)).toEqual([]);
  },
};

export const EditorPlaceholderSlug: Story = {
  name: "MentorPageForm · placeholder slug: the name suggestion overwrites it until a manual edit (test, D4)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={PLACEHOLDER} slugIsPlaceholder baseUrl="http://localhost:3000" action={ok} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByLabelText("Imię i nazwisko");
    const slug = canvas.getByLabelText("Adres strony");
    await expect(slug).toHaveValue("mentor-k3x7qa");
    await expect(slug).toHaveAccessibleDescription(/http:\/\/localhost:3000\/m\/mentor-k3x7qa/);
    await userEvent.type(name, "A");
    await expect(slug).toHaveValue("mentor-k3x7qa"); // „a” is not an address yet: the placeholder stays
    await userEvent.type(name, "nna K.");
    await expect(slug).toHaveValue("anna-k");
    await expect(slug).toHaveAccessibleDescription(/http:\/\/localhost:3000\/m\/anna-k/);
    await userEvent.clear(slug);
    await userEvent.type(slug, "anna-dev");
    await userEvent.type(name, "owalska");
    await expect(slug).toHaveValue("anna-dev");
  },
};

export const EditorUnauthorized: Story = {
  name: "MentorPageForm · session expired on save: alert, input kept, no redirect (test, D5)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={FILLED} baseUrl="http://localhost:3000" action={unauthorized} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText("Twoje doświadczenie"));
    await userEvent.type(canvas.getByLabelText("Twoje doświadczenie"), "Nowy opis.");
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(SESSION_EXPIRED_MESSAGE);
    await expect(canvas.getByLabelText("Twoje doświadczenie")).toHaveValue("Nowy opis.");
    await expect(canvas.getByLabelText("Imię i nazwisko")).toHaveValue("Anna K.");
    await expect(canvas.getByRole("button", { name: "Opublikuj stronę" })).toBeVisible();
    await expect(canvas.queryByRole("textbox", { name: "Twój link" })).toBeNull();
  },
};

export const EditorServerFieldErrors: Story = {
  name: "MentorPageForm · server field errors inline, focus on the first (test)",
  render: () => (
    <div className="p-page-gutter">
      <MentorPageForm
        initial={FILLED}
        baseUrl="http://localhost:3000"
        action={async () => ({ ok: false as const, errors: { publicWorkUrl: "Dodaj link do publicznej pracy", description: "Opisz swoje doświadczenie (do 2000 znaków)" } })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const url = canvas.getByLabelText("Link do publicznej pracy");
    await waitFor(() => expect(url).toHaveFocus());
    await expect(url).toHaveAccessibleDescription(/Dodaj link do publicznej pracy/);
    await expect(canvas.getByLabelText("Twoje doświadczenie")).toHaveAccessibleDescription(/Opisz swoje doświadczenie/);
    await expect(canvas.getByLabelText("Twoje doświadczenie")).toHaveValue(ANNA.description);
  },
};

export const EditorPriceMessages: Story = {
  name: "MentorPageForm · price errors name the length, as on the server (test)",
  render: () => <div className="p-page-gutter"><MentorPageForm initial={{ ...FILLED, price25: "10", price50: "150,50" }} baseUrl="http://localhost:3000" action={ok} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const price25 = canvas.getByLabelText("Cena za 25 min (zł)");
    await waitFor(() => expect(price25).toHaveFocus());
    await expect(price25).toHaveAccessibleDescription(/Podaj cenę za 25 min od 20 do 5000 zł, bez groszy/);
    await expect(canvas.getByLabelText("Cena za 50 min (zł)")).toHaveAccessibleDescription(/Podaj cenę za 50 min od 20 do 5000 zł, bez groszy/);
  },
};

/*
 * Lengths and the link rule come from the module the server uses too (`src/lib/text.mjs`, `@devmentor/ui/text`):
 * an emoji is 1 character (not 2 UTF-16 units) and any http(s) host is fine, also localhost with a port.
 */
const EMOJI = "😀";
const DESCRIPTION_2000 = "x".repeat(1000) + EMOJI.repeat(1000); // 2000 characters, 3000 UTF-16 units
const SHARED_RULES: MentorPageValues = { ...FILLED, displayName: `Anna ${EMOJI}`, publicWorkUrl: "http://localhost:3000/x", description: DESCRIPTION_2000 };
const publishShared = fn(async () => ({ ok: true as const, shareUrl: SHARE_URL }));

export const EditorSharedRulesAccepted: Story = {
  name: "MentorPageForm · 2000 characters with emoji and a localhost link are accepted, as on the server (test)",
  render: () => (
    <div className="p-page-gutter">
      <MentorPageForm initial={SHARED_RULES} baseUrl="http://localhost:3000" action={publishShared} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    publishShared.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    await expect(await canvas.findByRole("textbox", { name: "Twój link" })).toHaveValue(SHARE_URL);
    await expect(publishShared).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("textbox", { name: /Twoje doświadczenie/ })).not.toHaveAccessibleDescription(/do 2000 znaków/);
  },
};

export const EditorSharedRulesTooLong: Story = {
  name: "MentorPageForm · 2001 characters with emoji are rejected, as on the server (test)",
  render: () => (
    <div className="p-page-gutter">
      <MentorPageForm initial={{ ...SHARED_RULES, description: DESCRIPTION_2000 + EMOJI }} baseUrl="http://localhost:3000" action={publishShared} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    publishShared.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Opublikuj stronę" }));
    const description = canvas.getByRole("textbox", { name: /Twoje doświadczenie/ });
    await waitFor(() => expect(description).toHaveFocus());
    await expect(description).toHaveAccessibleDescription(/Opisz swoje doświadczenie \(do 2000 znaków\)/);
    await expect(publishShared).not.toHaveBeenCalled();
  },
};

export const EditorPublishedVisit: Story = {
  name: "MentorPageForm · published page, later visit: share panel without focus, slug locked (test, D6)",
  render: () => (
    <div className="p-page-gutter">
      <MentorPageForm initial={FILLED} published shareUrl={SHARE_URL} baseUrl="http://localhost:3000" action={ok} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("textbox", { name: "Twój link" });
    await expect(link).toHaveValue(SHARE_URL);
    await expect(link).toHaveAccessibleDescription("Wklej go tam, gdzie ludzie już cię pytają.");
    await expect(canvas.getByRole("button", { name: "Kopiuj link" })).toBeVisible();
    await expect(link).not.toHaveFocus();
    await expect(canvasElement.contains(document.activeElement)).toBe(false);
    // Share panel above the form.
    const form = canvasElement.querySelector("form") as HTMLFormElement;
    await expect(link.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const slug = canvas.getByLabelText("Adres strony");
    await expect(slug).toHaveAttribute("readonly");
    await expect(slug).toHaveAccessibleDescription(`Pełny link: ${SHARE_URL}. Adresu nie można zmienić po publikacji.`);
    await expect(canvas.getByRole("button", { name: "Zapisz zmiany" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Zapisz szkic" })).toBeNull();
  },
};

export const EditorPublishedSave: Story = {
  name: "MentorPageForm · published page, save changes: panel stays, focus stays (test)",
  render: () => (
    <div className="p-page-gutter">
      <MentorPageForm initial={FILLED} published shareUrl={SHARE_URL} baseUrl="http://localhost:3000" action={ok} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Zapisz zmiany" });
    await userEvent.click(button);
    await expect(await canvas.findByText("Zmiany są już na twojej stronie — link się nie zmienił")).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Twój link" })).not.toHaveFocus();
  },
};

/* ---------------------------------------------------- share link, notice */
export const ShareLink: Story = { name: "ShareLinkPanel · right after publishing (focus on the link)", render: () => <div className="p-page-gutter max-w-text"><ShareLinkPanel shareUrl={SHARE_URL} /></div> };
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
