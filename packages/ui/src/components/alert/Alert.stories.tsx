import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { Button } from "../button/Button";
import { TextLink } from "../text-link/TextLink";
import { Alert } from "./Alert";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
  tags: ["!autodocs"],
  args: {
    tone: "danger",
    title: "Ten termin właśnie się zajął — wybierz inny",
    children: "Twoje pytanie zostało w formularzu. Lista terminów jest odświeżona.",
  },
  argTypes: { tone: { control: "inline-radio", options: ["info", "success", "danger"] }, action: { control: false } },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  name: "Tones",
  render: () => (
    <div className="flex max-w-text flex-col gap-between-groups">
      <Alert tone="info" title="Okna zachowają godziny (np. 18:00) w nowej strefie">
        Nic się nie zmieni, dopóki nie zapiszesz.
      </Alert>
      <Alert tone="info" title="Nie masz dostępności — nikt nie może wybrać terminu" action={<TextLink href="#availability">Dodaj okno</TextLink>} />
      <Alert tone="success" title="Strona opublikowana">Skopiuj link i wklej go tam, gdzie ludzie już cię pytają.</Alert>
      <Alert tone="danger" title="Cena zmieniła się na 180 zł" action={<Button variant="primary">Zapłać 180 zł i wyślij pytanie</Button>}>
        Mentor zmienił cenę, kiedy pisałeś pytanie. Potwierdź nową kwotę.
      </Alert>
    </div>
  ),
};

export const States: Story = {
  name: "States (static)",
  render: () => (
    <StateGrid
      items={[
        { label: "title only", node: <Alert tone="info" title="Nie masz dostępności — nikt nie może wybrać terminu" /> },
        { label: "title + body", node: <Alert tone="danger" title="Nie udało się otworzyć płatności — spróbuj ponownie">Nic nie zostało pobrane.</Alert> },
        { label: "title + action", node: <Alert tone="danger" title="Nie udało się otworzyć płatności" action={<Button variant="secondary">Spróbuj ponownie</Button>} /> },
      ]}
    />
  ),
};

export const LongNarrow: Story = {
  name: "Long text, 320 px",
  decorators: [narrow],
  args: {
    tone: "danger",
    title: "Mentor właśnie zaakceptował — anulowanie ze zwrotem nie jest już możliwe",
    children: "Sesja odbędzie się w wybranym terminie jako czat tekstowy. Link do sesji znajdziesz na tej stronie i w e-mailu.",
  },
};

export const DangerIsAnnounced: Story = {
  name: "Test: danger interrupts, info is polite",
  render: () => (
    <div className="flex flex-col gap-in-group">
      <Alert tone="danger" title="Ten termin właśnie się zajął — wybierz inny" />
      <Alert tone="info" title="Okna zachowają godziny w nowej strefie" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Ten termin właśnie się zajął — wybierz inny");
    await expect(canvas.getByRole("status")).toHaveTextContent("Okna zachowają godziny w nowej strefie");
  },
};
