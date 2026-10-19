import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { Button } from "../button/Button";
import { Panel } from "./Panel";

const meta = {
  title: "Primitives/Panel",
  component: Panel,
  tags: ["!autodocs"],
  args: {
    title: "Zapisz ten link",
    children: <p className="max-w-text">Wysłaliśmy go też na Twój e-mail. Przez ten link sprawdzisz stan zapytania albo je anulujesz.</p>,
  },
  argTypes: { children: { control: false }, titleAs: { control: "inline-radio", options: ["h2", "h3"] } },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "with title (labelled region)", node: (
          <Panel title="Twoja strona">
            <p>Wypełnij pięć pól i opublikuj stronę.</p>
            <div><Button variant="primary">Opublikuj stronę</Button></div>
          </Panel>
        ) },
        { label: "without title", node: <Panel><p>Czat tekstowy · 12:30–12:55</p></Panel> },
      ]}
    />
  ),
};

export const States: Story = {
  name: "States (static)",
  render: () => (
    <p className="max-w-text text-muted">
      Panel has no interactive states: it is not clickable. Hover, focus, pressed, disabled, loading, selected and
      error belong to the controls inside it.
    </p>
  ),
};

export const LongNarrow: Story = {
  name: "Long content, 320 px",
  decorators: [narrow],
  args: {
    title: "Twoje pytanie",
    children: (
      <p>
        Migruję aplikację na server components. Po przeniesieniu strony produktu testy w Jest przestały widzieć fetch z
        cache — co zwykle trzeba zmienić w konfiguracji i w mockach? Robię to pierwszy raz, a wycenę muszę wysłać jutro.
      </p>
    ),
  },
};

export const IsALabelledRegion: Story = {
  name: "Test: title names the region",
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole("region", { name: "Zapisz ten link" });
    await expect(region.tagName).toBe("SECTION");
    await expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent("Zapisz ten link");
  },
};
