import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { narrow } from "../../../.storybook/helpers";
import { Button } from "../button/Button";
import { CopyField } from "../copy-field/CopyField";
import { StateMessage } from "./StateMessage";

const meta = {
  title: "Primitives/StateMessage",
  component: StateMessage,
  tags: ["!autodocs"],
  args: {
    kind: "empty",
    title: "Nie masz jeszcze zapytań",
    children: "Udostępnij swój link tam, gdzie ludzie już cię pytają.",
  },
  argTypes: { kind: { control: "inline-radio", options: ["empty", "error", "not-found"] }, action: { control: false } },
} satisfies Meta<typeof StateMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  name: "Kinds",
  render: () => (
    <div className="flex flex-col gap-between-groups">
      <StateMessage
        kind="empty"
        title="Nie masz jeszcze zapytań"
        action={<CopyField label="Twój link" value="http://localhost:3000/m/anna-k" />}
      >
        Udostępnij swój link tam, gdzie ludzie już cię pytają.
      </StateMessage>
      <StateMessage kind="empty" title="Brak wolnych terminów w najbliższych 14 dniach" />
      <StateMessage kind="error" title="Nie udało się wczytać terminów — odśwież stronę" action={<Button variant="secondary">Odśwież</Button>} />
      <StateMessage kind="not-found" titleAs="h1" title="Nie ma takiej strony mentora" />
      <StateMessage kind="not-found" title="Ten link jest nieaktywny — poproś zespół o nowy" />
    </div>
  ),
};

export const States: Story = {
  name: "States (static)",
  render: () => (
    <p className="max-w-text text-muted">
      StateMessage has no interactive states of its own; its action (Button or TextLink) carries hover, focus and
      loading.
    </p>
  ),
};

export const LongNarrow: Story = {
  name: "Long text, 320 px",
  decorators: [narrow],
  args: {
    kind: "not-found",
    title: "Dostęp tylko przez zaproszenie — poproś zespół o link do logowania",
    children: "Jeśli korzystasz z nowego komputera, zespół wyśle ci nowy link. Konta z hasłem w DevMentorze nie ma.",
  },
};

export const ErrorWithRetry: Story = {
  name: "Test: error is announced and offers one next step",
  args: {
    kind: "error",
    title: "Nie udało się wczytać zapytań — odśwież",
    children: undefined,
    action: <Button variant="secondary" onClick={fn()}>Odśwież</Button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Nie udało się wczytać zapytań — odśwież");
    await expect(canvas.getByRole("heading", { level: 2 })).toHaveTextContent("Nie udało się wczytać zapytań");
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Odśwież" })).toHaveFocus();
  },
};
