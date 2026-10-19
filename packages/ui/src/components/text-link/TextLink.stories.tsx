import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { TextLink } from "./TextLink";

const meta = {
  title: "Primitives/TextLink",
  component: TextLink,
  tags: ["!autodocs"],
  args: { href: "#availability", children: "Dostępność", external: false },
} satisfies Meta<typeof TextLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "internal", node: <TextLink href="#availability">Dostępność</TextLink> },
        { label: "external", node: <TextLink href="https://github.com/annak" external>github.com/annak</TextLink> },
        { label: "inside a sentence", node: (
          <p className="max-w-text">
            Nie masz dostępności — nikt nie może wybrać terminu. <TextLink href="#availability">Dodaj okno</TextLink>
          </p>
        ) },
      ]}
    />
  ),
};

export const States: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "default", node: <TextLink href="#a">Dostępność</TextLink> },
        { label: "hover", node: <TextLink href="#a" data-preview-state="hover">Dostępność</TextLink> },
        { label: "focus", node: <TextLink href="#a" data-preview-state="focus">Dostępność</TextLink> },
      ]}
    />
  ),
};

export const LongNarrow: Story = {
  name: "Long URL, 320 px",
  decorators: [narrow],
  args: { href: "https://github.com/annak/server-components-migration-notes", external: true, children: "github.com/annak/server-components-migration-notes", className: "break-all" },
};

export const ExternalIsAnnounced: Story = {
  name: "Test: external link name and target",
  args: { href: "https://github.com/annak", external: true, children: "github.com/annak" },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: "github.com/annak (otwiera się w nowej karcie)" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
    link.focus();
    await expect(link).toHaveFocus();
  },
};
