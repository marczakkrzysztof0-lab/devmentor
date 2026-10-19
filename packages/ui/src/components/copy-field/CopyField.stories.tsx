import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { narrow } from "../../../.storybook/helpers";
import { CopyField } from "./CopyField";

const meta = {
  title: "Primitives/CopyField",
  component: CopyField,
  tags: ["!autodocs"],
  args: {
    label: "Twój link",
    value: "http://localhost:3000/m/anna-k",
    hint: "Wklej go tam, gdzie ludzie już cię pytają.",
  },
  decorators: [(Story) => <div className="max-w-text"><Story /></div>],
} satisfies Meta<typeof CopyField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <CopyField label="Twój link" value="http://localhost:3000/m/anna-k" hint="Wklej go tam, gdzie ludzie już cię pytają." />
      <CopyField
        label="Link do zapytania"
        value="http://localhost:3000/r/Qm9va2luZy1saW5rLWZvci1rdWJhLTI1LW1pbg"
        hint="Zapisz ten link — wysłaliśmy go też na Twój e-mail."
      />
    </div>
  ),
};

export const States: Story = {
  name: "States: idle, copied, copy blocked",
  render: () => (
    <p className="max-w-text text-muted">
      Idle: field + „Kopiuj link”. Copied: check icon and „Skopiowano.” (polite live region). Copy blocked: the link is
      selected and „Nie udało się skopiować — … skopiuj go ręcznie (Ctrl+C).” appears. The button carries hover, focus
      and pressed (see Button). Run the tests below to see the copied and blocked states.
    </p>
  ),
};

export const LongNarrow: Story = {
  name: "Long link, 320 px",
  decorators: [narrow],
  args: { label: "Link do zapytania", value: "http://localhost:3000/r/Qm9va2luZy1saW5rLWZvci1rdWJhLTI1LW1pbg" },
};

export const CopySucceeds: Story = {
  name: "Test: copy announces „Skopiowano.”",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { copied = text; } },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Kopiuj link" }));
    await waitFor(() => expect(canvas.getByText("Skopiowano.")).toBeVisible());
    await expect(copied).toBe("http://localhost:3000/m/anna-k");
    await expect(canvas.getByRole("textbox", { name: "Twój link" })).toHaveAccessibleDescription(
      "Wklej go tam, gdzie ludzie już cię pytają.",
    );
  },
};

export const CopyBlocked: Story = {
  name: "Test: blocked clipboard selects the link and says so",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("blocked"); } },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Kopiuj link" }));
    await waitFor(() => expect(canvas.getByText(/skopiuj go ręcznie/)).toBeVisible());
    const input = canvas.getByRole("textbox", { name: "Twój link" }) as HTMLInputElement;
    await expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
  },
};
