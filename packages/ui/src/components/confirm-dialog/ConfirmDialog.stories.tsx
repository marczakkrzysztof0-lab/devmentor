import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { Button } from "../button/Button";
import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  title: "Primitives/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["!autodocs"],
  args: {
    trigger: <Button variant="secondary">Odrzucam</Button>,
    title: "Odrzucić pytanie Kuby?",
    description: "Odrzucenie zwraca pieniądze deweloperowi (150 zł). Tego nie da się cofnąć.",
    confirmLabel: "Odrzucam pytanie",
    onConfirm: fn(),
    onOpenChange: fn(),
  },
  argTypes: { trigger: { control: false } },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Open dialogs, one per product decision (controlled `open`). */
export const Variants: Story = {
  name: "Variants (product decisions, open)",
  args: {
    trigger: undefined,
    open: true,
    title: "Anulować zapytanie?",
    description: "Na pewno? Mentor nie zobaczy już tego pytania. Zwrot 150 zł zlecimy automatycznie.",
    confirmLabel: "Anuluj i odzyskaj 150 zł",
    cancelLabel: "Wróć",
  },
};

export const AcceptVariant: Story = {
  name: "Variant: accept (open)",
  args: {
    trigger: undefined,
    open: true,
    title: "Zaakceptować pytanie Kuby?",
    description: "Sesja odbędzie się jutro 12:30–12:55 jako czat tekstowy. Po akceptacji deweloper nie może już anulować ze zwrotem.",
    confirmLabel: "Akceptuję pytanie",
  },
};

export const States: Story = {
  name: "State: action in progress (open)",
  args: { trigger: undefined, open: true, loading: true },
};

export const LongNarrow: Story = {
  name: "Long text (narrow window: resize the preview)",
  args: {
    trigger: undefined,
    open: true,
    title: "Odrzucić pytanie Kuby o migrację na server components?",
    description:
      "Odrzucenie zwraca pieniądze deweloperowi (280 zł). Pytanie zniknie z listy „Czeka na decyzję” i trafi do „Zakończone”. Tego nie da się cofnąć.",
  },
};

export const KeyboardFlow: Story = {
  name: "Test: focus starts on „Wróć”, Esc closes, confirm runs",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    const trigger = canvas.getByRole("button", { name: "Odrzucam" });

    await userEvent.click(trigger);
    const dialog = await page.findByRole("alertdialog", { name: "Odrzucić pytanie Kuby?" });
    await expect(dialog).toHaveAccessibleDescription(/zwraca pieniądze deweloperowi/);
    await waitFor(() => expect(page.getByRole("button", { name: "Wróć" })).toHaveFocus());

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(args.onConfirm).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    await userEvent.click(await page.findByRole("button", { name: "Odrzucam pytanie" }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(page.queryByRole("alertdialog")).toBeNull());
  },
};
