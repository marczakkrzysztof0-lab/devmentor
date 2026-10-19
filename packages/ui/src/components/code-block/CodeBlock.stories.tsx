import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { narrow, StateGrid } from "../../../.storybook/helpers";
import { CodeBlock, InlineCode } from "./CodeBlock";

const CODE = `export default async function Page() {
  const product = await fetch("/api/product", { cache: "force-cache" }).then((r) => r.json());
  return <ProductView product={product} />;
}`;

const meta = {
  title: "Primitives/CodeBlock",
  component: CodeBlock,
  tags: ["!autodocs"],
  args: { code: CODE, label: "Kod z pytania" },
  decorators: [(Story) => <div className="max-w-text"><Story /></div>],
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <StateGrid
      items={[
        { label: "CodeBlock", node: <CodeBlock label="Kod z pytania" code={"helm upgrade ingress-nginx ingress-nginx/ingress-nginx"} /> },
        { label: "InlineCode in a sentence", node: (
          <p className="max-w-text">
            Twoja strona jest pod adresem <InlineCode>/m/anna-k</InlineCode>. Plik <InlineCode>values.yaml</InlineCode> wklej w pytaniu.
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
        { label: "default", node: <CodeBlock label="Kod" code={'cache: "force-cache"'} /> },
        { label: "focus (keyboard scroll)", node: <CodeBlock label="Kod" code={'cache: "force-cache"'} data-preview-state="focus" /> },
      ]}
    />
  ),
};

export const LongNarrow: Story = {
  name: "Long lines, 320 px (scrolls, does not wrap)",
  decorators: [narrow],
};

export const KeyboardScroll: Story = {
  name: "Test: a wide block can be focused and scrolled",
  decorators: [narrow],
  play: async ({ canvasElement }) => {
    const block = within(canvasElement).getByLabelText("Kod z pytania");
    await userEvent.tab();
    await expect(block).toHaveFocus();
    await expect(block.scrollWidth).toBeGreaterThan(block.clientWidth);
    await expect(block).toHaveTextContent('cache: "force-cache"');
  },
};
