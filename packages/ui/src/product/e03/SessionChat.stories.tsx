import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { ZONE, warsaw } from "../../../.storybook/fixtures";
import { narrow } from "../../../.storybook/helpers";
import { NO_SHOW_RULE, SessionChat, TEXT_ONLY_NOTICE, type SessionChatProps, type SessionMessage, type SessionSnapshot } from "./SessionChat";

type Load = SessionChatProps["load"];
type Send = SessionChatProps["send"];

// Session from spec #20 story 1: Kuba and Anna, 22.10.2026 12:30–12:55 (25 min).
const OPENS = warsaw("2026-10-22", "12:30");
const CLOSES = warsaw("2026-10-22", "12:55");
const at = (minutes: number) => new Date(new Date(OPENS).getTime() + minutes * 60_000).toISOString();
const message = (seq: number, author: "me" | "other", body: string, minute: number): SessionMessage => ({ id: `m${seq}`, seq, author, body, createdAt: at(minute) });

const CODE = [
  "Po przejściu na app router dostaję:",
  "",
  "Error: Hydration failed because the server rendered HTML did not match the client.",
  "    at throwOnHydrationMismatch (react-dom.development.js:1234)",
  "    at OrderList (app/orders/list.tsx:18)",
  "",
  "Komponent czyta new Date() w renderze.",
].join("\n");
const CONVERSATION: SessionMessage[] = [
  message(1, "me", "Dzień dobry, wklejam błąd:", 1),
  message(2, "me", CODE, 1),
  message(3, "other", "Widzę. new Date() w renderze daje inną wartość na serwerze i w przeglądarce — przenieś to do efektu albo przekaż czas z serwera.", 3),
];

const snapshot = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  phase: "open",
  opensAt: OPENS,
  closesAt: CLOSES,
  now: at(4),
  viewer: "mentee",
  otherName: "Anna K.",
  messages: [],
  hasMore: false,
  limitReached: false,
  ...over,
});
const noNews = fn<Load>(async () => ({ ok: true as const, snapshot: snapshot() }));
const stored = fn<Send>(async (body: string) => ({ ok: true as const, message: message(99, "me", body, 5) }));

const meta = {
  title: "Product/E03 Session/Session chat",
  component: SessionChat,
  tags: ["!autodocs"],
  args: { initial: snapshot(), timeZone: ZONE, load: noNews, send: stored, pollMs: 60_000 },
  decorators: [(Story) => <div className="max-w-page p-page-gutter"><Story /></div>],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SessionChat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Before: Story = {
  name: "SessionChat · before the slot",
  args: { initial: snapshot({ phase: "before", now: at(-5) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Czat otworzy się .*12:30/)).toBeVisible();
    await expect(canvas.getByText(TEXT_ONLY_NOTICE)).toBeVisible();
    await expect(canvas.getByText(NO_SHOW_RULE.mentee)).toBeVisible();
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};

export const OpenEmpty: Story = {
  name: "SessionChat · open, empty → send",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Sesja trwa — zostało 21 min/)).toBeVisible();
    await expect(canvas.getByText(/Nikt jeszcze nie napisał/)).toBeVisible();
    await expect(canvas.getByText(TEXT_ONLY_NOTICE)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /wideo|głos|zadzwoń/i })).toBeNull();
    await userEvent.type(canvas.getByRole("textbox", { name: "Twoja wiadomość" }), "Dzień dobry");
    await userEvent.click(canvas.getByRole("button", { name: "Wyślij" }));
    await expect(args.send).toHaveBeenCalledWith("Dzień dobry");
    await waitFor(() => expect(canvas.getByRole("list", { name: "Wiadomości sesji" })).toHaveTextContent("Dzień dobry"));
    await expect(canvas.getByRole("textbox", { name: "Twoja wiadomość" })).toHaveValue("");
  },
};

export const OpenConversation: Story = {
  name: "SessionChat · open, conversation with code (developer)",
  args: { initial: snapshot({ messages: CONVERSATION }) },
  play: async ({ canvasElement }) => {
    const items = within(within(canvasElement).getByRole("list", { name: "Wiadomości sesji" })).getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    await expect(items[0]).toHaveTextContent(/^Ty/);
    await expect(items[2]).toHaveTextContent(/^Anna K\./);
  },
};

export const OpenMentor: Story = {
  name: "SessionChat · open, mentor's view",
  args: {
    initial: snapshot({
      viewer: "mentor",
      otherName: "Kuba",
      messages: CONVERSATION.map((m) => ({ ...m, author: m.author === "me" ? ("other" as const) : ("me" as const) })),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("listitem")[0]).toHaveTextContent(/^Kuba/);
    await expect(within(canvasElement).getByText(NO_SHOW_RULE.mentor)).toBeVisible();
  },
};

export const NewMessageArrives: Story = {
  name: "SessionChat · polling brings a new message",
  args: {
    pollMs: 50,
    initial: snapshot({ messages: CONVERSATION.slice(0, 1) }),
    load: fn<Load>(async () => ({ ok: true as const, snapshot: snapshot({ messages: [message(3, "other", "Pokaż stack trace.", 2)] }) })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getAllByRole("listitem")).toHaveLength(2));
    await expect(canvas.getByText("Nowa wiadomość od: Anna K.")).toBeInTheDocument();
  },
};

export const Ended: Story = {
  name: "SessionChat · ended (read only)",
  args: { initial: snapshot({ phase: "ended", now: at(30), messages: CONVERSATION }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Sesja zakończona — czat tylko do odczytu")).toBeVisible();
    await expect(canvas.queryByRole("textbox")).toBeNull();
    await expect(canvas.getByText(TEXT_ONLY_NOTICE)).toBeVisible();
  },
};

export const EndedEmpty: Story = {
  name: "SessionChat · ended, nobody wrote",
  args: { initial: snapshot({ phase: "ended", now: at(30) }) },
};

export const Offline: Story = {
  name: "SessionChat · polling fails → no connection",
  args: { pollMs: 20, load: fn<Load>(async () => Promise.reject(new TypeError("Failed to fetch"))) },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText("Brak połączenia — próbujemy ponownie")).toBeVisible());
  },
};

export const SendFailed: Story = {
  name: "SessionChat · send fails → text kept",
  args: { send: fn<Send>(async () => Promise.reject(new TypeError("Failed to fetch"))) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole("textbox", { name: "Twoja wiadomość" });
    await userEvent.type(box, "Mój kod nie działa");
    await userEvent.click(canvas.getByRole("button", { name: "Wyślij" }));
    await waitFor(() => expect(canvas.getByText(/Brak połączenia z internetem/)).toBeVisible());
    await expect(box).toHaveValue("Mój kod nie działa");
  },
};

export const SendClosed: Story = {
  name: "SessionChat · sent after the end → refused",
  args: { send: fn<Send>(async () => ({ ok: false as const, reason: "closed" as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Twoja wiadomość" }), "Ostatnia odpowiedź");
    await userEvent.click(canvas.getByRole("button", { name: "Wyślij" }));
    await waitFor(() => expect(canvas.getByText("Sesja już się zakończyła — wiadomość nie została wysłana.")).toBeVisible());
  },
};

export const LimitReached: Story = {
  name: "SessionChat · message limit reached",
  args: { initial: snapshot({ messages: CONVERSATION, limitReached: true }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Limit wiadomości w tej sesji został osiągnięty.")).toBeVisible();
    await expect(within(canvasElement).queryByRole("textbox")).toBeNull();
  },
};

export const SignedOut: Story = {
  name: "SessionChat · mentor signed out",
  args: { pollMs: 20, load: fn<Load>(async () => ({ ok: false as const, reason: "signed_out" as const })) },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText("Sesja logowania wygasła — zaloguj się ponownie")).toBeVisible());
  },
};

export const Narrow: Story = {
  name: "SessionChat · 320 px with code",
  args: { initial: snapshot({ messages: CONVERSATION }) },
  decorators: [narrow],
};
